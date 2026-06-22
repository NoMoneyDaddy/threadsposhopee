// 草稿資料層：草稿 CRUD、排程時段、發文佇列、延遲留言（串文 2/2）生命週期。
// 由 store.ts 拆出（God File 漸進拆分）。多租戶：service-role 繞 RLS，以 owner_id 應用層過濾；
// 背景 worker 的跨租戶查詢（listApprovedDrafts/listRepliesDue/reclaim*）僅由 cron 呼叫、不吃使用者輸入，
// 實際發文/更新仍以該列自己的 owner_id 過濾。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import type { Draft, Material } from "./types";

// 從素材快照產生一篇草稿（重用文案/連結/媒體，不重燒 token）
export async function createDraftFromMaterial(
  material: Material,
  opts: {
    owner_id: string;
    source_id?: string | null;
    threads_account_id?: string | null;
    source_post_id?: string | null;
    status: Draft["status"];
    scheduled_at?: string | null;
  }
): Promise<Draft> {
  return createDraft({
    owner_id: opts.owner_id,
    material_id: material.id,
    source_id: opts.source_id ?? null,
    threads_account_id: opts.threads_account_id ?? null,
    source_post_id: opts.source_post_id ?? null,
    product_name: material.product_name,
    clean_product_url: material.clean_product_url,
    shopee_short_link: material.affiliate_short_link,
    media_type: material.media_type,
    source_media_url: material.source_media_url,
    cloudinary_media_url: material.cloudinary_media_url,
    main_text: material.main_text,
    reply_text: material.reply_text,
    ai_raw: material.ai_raw,
    status: opts.status,
    scheduled_at: opts.scheduled_at ?? null
  });
}

// 最近已發布、且有 Threads 貼文 id 的草稿（查互動數據用）。
export type PublishedPostRef = {
  id: string;
  product_name: string | null;
  published_post_id: string;
  threads_account_id: string | null;
  published_at: string | null;
};
export async function listRecentPublishedPosts(ownerId: string, limit = 15): Promise<PublishedPostRef[]> {
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.status === "published" && d.published_post_id)
      .sort((a, b) => (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at))
      .slice(0, limit)
      .map((d) => ({
        id: d.id,
        product_name: d.product_name ?? null,
        published_post_id: d.published_post_id as string,
        threads_account_id: d.threads_account_id ?? null,
        published_at: d.published_at ?? d.created_at
      }));
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("id, product_name, published_post_id, threads_account_id, published_at")
    .eq("owner_id", ownerId)
    .eq("status", "published")
    .not("published_post_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PublishedPostRef[];
}

// 同素材「已排入／已發布」的重複發文計數（給重發上限把關用）。
// 只計已承諾發文的狀態（approved/publishing/published/needs_verification）；
// 未承諾的 draft 與 failed/rejected 不算。回傳跨帳號合計與指定帳號的計數。
const REPOST_COUNTED_STATUSES = ["approved", "publishing", "published", "needs_verification"];

export async function countMaterialReposts(
  ownerId: string,
  materialId: string,
  accountId: string
): Promise<{ perAccount: number; total: number }> {
  if (isDemoMode) {
    const rows = demo.drafts.filter(
      (d) => d.material_id === materialId && REPOST_COUNTED_STATUSES.includes(d.status)
    );
    return { total: rows.length, perAccount: rows.filter((d) => d.threads_account_id === accountId).length };
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("threads_account_id")
    .eq("owner_id", ownerId)
    .eq("material_id", materialId)
    .in("status", REPOST_COUNTED_STATUSES)
    .limit(1000);
  const rows = data ?? [];
  return { total: rows.length, perAccount: rows.filter((r) => r.threads_account_id === accountId).length };
}

export async function listDrafts(ownerId: string): Promise<Draft[]> {
  if (isDemoMode) return [...demo.drafts].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as Draft[];
}

// 取出某使用者已占用的未來排程時刻（給「加入佇列」找下一個空時段）
export async function listTakenScheduledSlots(ownerId: string): Promise<Set<string>> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return new Set(
      demo.drafts
        .filter((d) => d.owner_id === ownerId && d.status === "approved" && d.scheduled_at && d.scheduled_at > nowIso)
        .map((d) => d.scheduled_at as string)
    );
  }
  const sb = getServiceClient()!;
  // 只算 approved（與 migration 0008 唯一索引一致），避免被 draft/rejected 的 scheduled_at 誤占
  const { data } = await sb
    .from("drafts")
    .select("scheduled_at")
    .eq("owner_id", ownerId)
    .eq("status", "approved")
    .not("scheduled_at", "is", null)
    .gt("scheduled_at", nowIso);
  return new Set((data ?? []).map((r) => new Date(r.scheduled_at as string).toISOString()));
}

// 人工改排程時間：只允許佇列中（approved）的草稿。撞 migration 0008 唯一索引（同帳號同時段）回 taken。
export async function rescheduleDraft(
  id: string,
  ownerId: string,
  iso: string
): Promise<{ ok: true; draft: Draft } | { ok: false; reason: "notfound" | "taken" }> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id && x.status === "approved");
    if (!d) return { ok: false, reason: "notfound" };
    d.scheduled_at = iso;
    return { ok: true, draft: d };
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("drafts")
    .update({ scheduled_at: iso })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("status", "approved")
    .select()
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "taken" };
    throw new Error(`改排程失敗：${error.message}`);
  }
  if (!data) return { ok: false, reason: "notfound" };
  return { ok: true, draft: data as Draft };
}

// 商品冷卻：該 owner 是否在 sinceIso 之後已發過同一分潤商品（跨任一帳號）。
export async function wasProductPublishedSince(ownerId: string, cleanUrl: string, sinceIso: string): Promise<boolean> {
  if (isDemoMode) {
    return demo.drafts.some(
      (d) =>
        d.owner_id === ownerId &&
        d.status === "published" &&
        d.clean_product_url === cleanUrl &&
        (d.published_at ?? d.created_at) >= sinceIso
    );
  }
  const sb = getServiceClient()!;
  const { count } = await sb
    .from("drafts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "published")
    .eq("clean_product_url", cleanUrl)
    .gte("published_at", sinceIso);
  return (count ?? 0) > 0;
}

export async function getDraft(id: string, ownerId: string): Promise<Draft | null> {
  if (isDemoMode) return demo.drafts.find((d) => d.id === id) ?? null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return (data as Draft) ?? null;
}

export async function createDraft(input: Partial<Draft>): Promise<Draft> {
  const draft: Draft = { id: randomUUID(), status: "draft", created_at: new Date().toISOString(), ...input } as Draft;
  if (isDemoMode) {
    demo.drafts.unshift(draft);
    return draft;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("drafts").insert(draft).select().single();
  if (error) throw error;
  return data as Draft;
}

// 編輯草稿（人工修改文案等），限本人
export async function updateDraft(id: string, ownerId: string, patch: Partial<Draft>): Promise<Draft | null> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, patch);
    return d ?? null;
  }
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").update(patch).eq("id", id).eq("owner_id", ownerId).select().maybeSingle();
  return (data as Draft) ?? null;
}

// 刪除草稿，限本人
export async function deleteDraft(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.drafts.findIndex((x) => x.id === id);
    if (i >= 0) demo.drafts.splice(i, 1);
    return i >= 0;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("drafts").delete().eq("id", id).eq("owner_id", ownerId);
  return !error;
}

// ownerId 可選：背景 worker（跨租戶）傳入做縱深防禦，確保更新不越界到他人列；
// API route 端已先以 getDraft(id, ownerId) 驗證歸屬，可不帶。
export async function updateDraftStatus(id: string, status: Draft["status"], patch: Partial<Draft> = {}, ownerId?: string) {
  // error 訊息截斷到 500 字，避免外部 API 巨量錯誤撐爆欄位
  if (typeof patch.error === "string") patch = { ...patch, error: patch.error.slice(0, 500) };
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, { status, ...patch });
    return d;
  }
  const sb = getServiceClient()!;
  let q = sb.from("drafts").update({ status, ...patch }).eq("id", id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q.select().single();
  return data as Draft;
}

// 回收卡住的草稿：publishing 超過 staleMinutes（多半是程序中斷）→ 標 needs_verification。
// 卡在 publishing 代表發布步驟途中斷線，「可能已發出但 DB 沒寫到」→ 不可自動重發（會雙貼），
// 也不可放進批次重試，須由人工到 Threads 確認後再決定重發或放棄（needs_verification 狀態）。
export async function reclaimStalePublishing(staleMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const msg = "發文程序中斷，可能已發出，請到 Threads 確認後再決定重發或退回";
  if (isDemoMode) {
    let n = 0;
    for (const d of demo.drafts) {
      if (d.status === "publishing" && d.created_at < cutoff) {
        d.status = "needs_verification";
        d.error = msg;
        n++;
      }
    }
    return n;
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .update({ status: "needs_verification", error: msg })
    .eq("status", "publishing")
    .lt("updated_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

// 延遲留言 worker 用：撈「主文已發、留言待補且到期」的草稿。
// 與 listApprovedDrafts 同屬「跨租戶 worker 查詢」：只由 publishDueReplies（背景）呼叫、
// 絕不吃使用者輸入；實際發文/更新仍以該列自己的 owner_id 過濾（見 mark* / getThreadsCredentials）。
// 只回傳補留言會用到的欄位（型別誠實標示，避免誤用其他 Draft 欄位拿到 undefined）
export type ReplyDueDraft = Pick<Draft, "id" | "owner_id" | "threads_account_id" | "published_post_id" | "reply_text">;
export async function listRepliesDue(limit = 20): Promise<ReplyDueDraft[]> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.reply_status === "pending" && d.reply_due_at && d.reply_due_at <= nowIso)
      .slice(0, limit);
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("drafts")
    .select("id, owner_id, threads_account_id, published_post_id, reply_text")
    .eq("reply_status", "pending")
    .not("reply_due_at", "is", null)
    .lte("reply_due_at", nowIso)
    .order("reply_due_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`撈待補留言失敗：${error.message}`);
  return (data ?? []) as ReplyDueDraft[];
}

// 原子認領一則待補留言：只有 reply_status 仍是 'pending' 才搶得到（pending→publishing-reply）。
// 防中斷窗口（已呼叫外部 API 但還沒寫 DB）下輪重複補發同一則留言。
export async function claimReplyForPublish(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d && d.reply_status === "pending") {
      d.reply_status = "publishing-reply";
      return true;
    }
    return false;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("drafts")
    .update({ reply_status: "publishing-reply" })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("reply_status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`認領待補留言失敗：${error.message}`);
  return Boolean(data);
}

// 回收卡在 publishing-reply（程序中斷）的留言 → 標 failed，避免永久卡住。
// 以 updated_at（＝認領時間，trg_drafts_updated 觸發器維護）判斷逾期，而非 reply_due_at——
// 否則分片並行下，另一片剛認領（reply_due_at 可能很舊的積壓件）會被本片誤判逾期回收成 failed。
export async function reclaimStaleReplies(staleMinutes = 15): Promise<number> {
  if (isDemoMode) return 0;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .update({ reply_status: "failed", error: "補留言程序中斷" })
    .eq("reply_status", "publishing-reply")
    .lt("updated_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

export async function markReplyPublished(id: string, ownerId: string, replyPostId: string): Promise<void> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, { reply_status: "published", reply_post_id: replyPostId });
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("drafts")
    .update({ reply_status: "published", reply_post_id: replyPostId })
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`標記留言已發失敗：${error.message}`);
}

export async function markReplyFailed(id: string, ownerId: string, err: string): Promise<void> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, { reply_status: "failed", error: err.slice(0, 500) });
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("drafts")
    .update({ reply_status: "failed", error: err.slice(0, 500) })
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) throw new Error(`標記留言失敗時出錯：${error.message}`);
}

// 人工重試「補留言失敗」：reply_status failed → pending、reply_due_at 設為現在，下輪 cron 立即重補。
// 原子守門（只認 failed），避免與正在補發的狀態打架；回傳是否搶到。
export async function requeueReply(id: string, ownerId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d && d.reply_status === "failed") {
      Object.assign(d, { reply_status: "pending", reply_due_at: nowIso, error: null });
      return true;
    }
    return false;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("drafts")
    .update({ reply_status: "pending", reply_due_at: nowIso, error: null })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("reply_status", "failed")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`重排補留言失敗：${error.message}`);
  return Boolean(data);
}

// 原子性狀態更新（compare-and-swap）：只有當目前狀態 == expectedStatus 才更新。
// ownerId 可選（背景 worker 傳入做縱深防禦，見 updateDraftStatus 註解）。
export async function updateDraftStatusAtomic(
  id: string,
  status: Draft["status"],
  expectedStatus: Draft["status"],
  patch: Partial<Draft> = {},
  ownerId?: string
): Promise<Draft | null> {
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d && d.status === expectedStatus) {
      Object.assign(d, { status, ...patch });
      return d;
    }
    return null;
  }
  const sb = getServiceClient()!;
  let q = sb.from("drafts").update({ status, ...patch }).eq("id", id).eq("status", expectedStatus);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q.select().maybeSingle();
  return (data as Draft) ?? null;
}

// 發文佇列：取出可發布的草稿（全租戶，發到各自綁定的 Threads 帳號）。背景 worker 用。
// 上限避免大量積壓時整批載入記憶體爆掉；oldest-first（FIFO）確保積壓會跨輪逐步排空。
// ponytail: 分片過濾仍在 queue.ts 記憶體做；要 SQL 層分片需加預算 shard 欄位（migration），暫不做。
const APPROVED_DRAFTS_BATCH = 2000;
export async function listApprovedDrafts(limit = APPROVED_DRAFTS_BATCH): Promise<Draft[]> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.status === "approved" && (!d.scheduled_at || d.scheduled_at <= nowIso))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("*")
    .eq("status", "approved")
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as Draft[];
}

// 發後讀回自動驗證 worker 用：跨租戶取 needs_verification 草稿（最舊優先）。僅 cron 呼叫。
export async function listNeedsVerificationAll(limit = 30): Promise<Draft[]> {
  if (isDemoMode) {
    return demo.drafts.filter((d) => d.status === "needs_verification").slice(0, limit);
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("*")
    .eq("status", "needs_verification")
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as Draft[];
}

// 分片模式專用：分頁掃描 approved 草稿、用 matches 過濾出屬於本片的，累積到 perShardLimit 或掃完。
// 避免「全域 limit 先截斷再記憶體分片」造成某些 shard 反覆拿到 0 筆（starvation）：本片若不在
// 全域最舊 N 筆內，仍能往後翻頁找到自己的草稿。maxPages×pageSize 為總掃描列數上限（記憶體封頂）。
export async function listApprovedDraftsForShard(
  matches: (accountId: string | null) => boolean,
  perShardLimit = 500,
  pageSize = 1000,
  maxPages = 20
): Promise<Draft[]> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.status === "approved" && (!d.scheduled_at || d.scheduled_at <= nowIso))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .filter((d) => matches(d.threads_account_id ?? null))
      .slice(0, perShardLimit);
  }
  const sb = getServiceClient()!;
  const out: Draft[] = [];
  for (let page = 0; page < maxPages && out.length < perShardLimit; page++) {
    const from = page * pageSize;
    const { data } = await sb
      .from("drafts")
      .select("*")
      .eq("status", "approved")
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }) // 穩定次排序：created_at 相同時防跨頁 range 漏抓/重複
      .range(from, from + pageSize - 1);
    const rows = (data ?? []) as Draft[];
    for (const d of rows) {
      if (matches(d.threads_account_id ?? null)) {
        out.push(d);
        if (out.length >= perShardLimit) break;
      }
    }
    if (rows.length < pageSize) break; // 已掃到尾
  }
  return out;
}
