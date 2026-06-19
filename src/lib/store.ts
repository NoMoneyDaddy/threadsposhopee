// 統一資料存取層。
// - 有設定 Supabase → 走 Supabase（service-role），並以 ownerId 在應用層過濾，達成多租戶隔離。
// - 沒設定（Demo 模式）→ 用記憶體 + fixtures（單人，忽略 ownerId）。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { env, isDemoMode } from "./env";
import { decrypt, encrypt } from "./crypto";
import type { Draft, Material, Source, ThreadsAccount, ShopeeAccount } from "./types";
import { DEFAULT_COPY_PREFS, normalizeCopyPrefs, type CopyPrefs } from "@/services/ai/prefs";
import { planAccountQueue } from "@/services/publish/cadence";
import demoData from "@/fixtures/demo-data.json";

// ── Demo 記憶體狀態（程序重啟即清空）──────────────────────────
const demo = {
  threadsAccounts: demoData.threadsAccounts as ThreadsAccount[],
  shopeeAccounts: demoData.shopeeAccounts as ShopeeAccount[],
  sources: demoData.sources as Source[],
  drafts: [...(demoData.drafts as Draft[])],
  materials: [] as Material[]
};

// 排程心跳（demo 用記憶體）
let demoHeartbeat: string | null = null;

// 寫入排程心跳（任一 cron 成功時呼叫），給儀表板顯示自動駕駛是否運轉。
export async function setHeartbeat(): Promise<void> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    demoHeartbeat = nowIso;
    return;
  }
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: "cron_heartbeat", value: nowIso, updated_at: nowIso }, { onConflict: "key" });
}

export async function getHeartbeat(): Promise<string | null> {
  if (isDemoMode) return demoHeartbeat;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", "cron_heartbeat").maybeSingle();
  return data?.value ?? null;
}

// ── 素材庫：以 (owner_id, shop_id, item_id) 為鍵，重用分潤連結＋AI 文案＋媒體 ──────
export async function findMaterial(shopId: string, itemId: string, ownerId: string): Promise<Material | null> {
  if (isDemoMode) {
    return demo.materials.find((m) => m.shop_id === shopId && m.item_id === itemId) ?? null;
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("shop_id", shopId)
    .eq("item_id", itemId)
    .maybeSingle();
  return (data as Material) ?? null;
}

export async function getMaterial(id: string, ownerId: string): Promise<Material | null> {
  if (isDemoMode) return demo.materials.find((m) => m.id === id) ?? null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("materials").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return (data as Material) ?? null;
}

export async function listMaterials(ownerId: string): Promise<Material[]> {
  if (isDemoMode) return [...demo.materials];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as Material[];
}

export async function createMaterial(input: Partial<Material>, ownerId: string): Promise<Material> {
  if (isDemoMode) {
    const existing = demo.materials.find((m) => m.shop_id === input.shop_id && m.item_id === input.item_id);
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const material = { id: randomUUID(), affiliate_valid: true, created_at: new Date().toISOString(), ...input } as Material;
    demo.materials.unshift(material);
    return material;
  }
  const sb = getServiceClient()!;
  // upsert on (owner_id,shop_id,item_id)：連結失效重產時不會撞唯一鍵，且不跨使用者
  const { data, error } = await sb
    .from("materials")
    .upsert({ affiliate_valid: true, ...input, owner_id: ownerId }, { onConflict: "owner_id,shop_id,item_id" })
    .select()
    .single();
  if (error) throw error;
  return data as Material;
}

// 連結健檢 worker 用：取最久沒檢查、目前仍有效的素材（跨租戶）。
export async function listMaterialsToCheck(
  limit = 30
): Promise<{ id: string; link: string }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("id, affiliate_short_link, affiliate_checked_at")
    .eq("affiliate_valid", true)
    .not("affiliate_short_link", "is", null)
    .order("affiliate_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data ?? [])
    .filter((m) => m.affiliate_short_link)
    .map((m) => ({ id: m.id, link: m.affiliate_short_link as string }));
}

// 寫回健檢結果：更新 checked_at；dead=true 才標 affiliate_valid=false（保守）。
export async function setAffiliateChecked(id: string, dead: boolean): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const patch: Record<string, unknown> = { affiliate_checked_at: new Date().toISOString() };
  if (dead) patch.affiliate_valid = false;
  await sb.from("materials").update(patch).eq("id", id);
}

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

export async function listThreadsAccounts(ownerId: string): Promise<ThreadsAccount[]> {
  if (isDemoMode) return demo.threadsAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("id,label,threads_user_id,token_expires_at,status")
    .eq("owner_id", ownerId);
  return (data ?? []) as ThreadsAccount[];
}

// 取出 Threads 帳號的發文憑證（解密後）。僅伺服器端使用，Demo 模式回 null。
export async function getThreadsCredentials(
  id: string
): Promise<{ threadsUserId: string; accessToken: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("threads_user_id, access_token_enc")
    .eq("id", id)
    .maybeSingle();
  if (!data?.access_token_enc) return null;
  return { threadsUserId: data.threads_user_id, accessToken: decrypt(data.access_token_enc) };
}

// 新增 Threads 發文帳號（access token / client secret 加密後存放）
export async function createThreadsAccount(
  input: {
    label: string;
    threads_user_id: string;
    access_token?: string;
    client_secret?: string;
    token_expires_at?: string | null;
  },
  ownerId: string
): Promise<ThreadsAccount> {
  if (isDemoMode) {
    const acc: ThreadsAccount = {
      id: randomUUID(),
      label: input.label,
      threads_user_id: input.threads_user_id,
      token_expires_at: input.token_expires_at ?? null,
      status: "active"
    };
    demo.threadsAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .insert({
      owner_id: ownerId,
      label: input.label,
      threads_user_id: input.threads_user_id,
      access_token_enc: input.access_token ? encrypt(input.access_token) : null,
      client_secret_enc: input.client_secret ? encrypt(input.client_secret) : null,
      token_expires_at: input.token_expires_at ?? null,
      status: "active"
    })
    .select("id,label,threads_user_id,token_expires_at,status")
    .single();
  if (error) throw error;
  return data as ThreadsAccount;
}

// OAuth 連帳號：依 (owner_id, threads_user_id) upsert。已存在則更新 token，否則新增。
export async function upsertThreadsAccountFromOAuth(
  input: {
    label: string;
    threads_user_id: string;
    access_token: string;
    token_expires_at: string;
  },
  ownerId: string
): Promise<ThreadsAccount> {
  if (isDemoMode) {
    const existing = demo.threadsAccounts.find((a) => a.threads_user_id === input.threads_user_id);
    if (existing) {
      existing.label = input.label;
      existing.token_expires_at = input.token_expires_at;
      existing.status = "active";
      return existing;
    }
    const acc: ThreadsAccount = {
      id: randomUUID(),
      label: input.label,
      threads_user_id: input.threads_user_id,
      token_expires_at: input.token_expires_at,
      status: "active"
    };
    demo.threadsAccounts.unshift(acc);
    return acc;
  }
  // 用 upsert 確保原子性、避免併發競態（依 migration 0006 的 (owner_id, threads_user_id) 唯一索引）
  const sb = getServiceClient()!;
  const payload = {
    owner_id: ownerId,
    threads_user_id: input.threads_user_id,
    label: input.label,
    access_token_enc: encrypt(input.access_token),
    token_expires_at: input.token_expires_at,
    status: "active"
  };
  const { data, error } = await sb
    .from("threads_accounts")
    .upsert(payload, { onConflict: "owner_id,threads_user_id" })
    .select("id,label,threads_user_id,token_expires_at,status")
    .single();
  if (error) throw error;
  return data as ThreadsAccount;
}

// ── 爬蟲子系統：每個使用者自己綁的 Apify 憑證（owner 用）──────────
// 取出某使用者的 Apify token + actor（解密）。沒綁則回 null（呼叫端可退回全域 env）。
export async function getApifyCredentials(ownerId: string): Promise<{ token: string; actor: string | null } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("apify_token_enc, apify_actor").eq("id", ownerId).maybeSingle();
  if (!data?.apify_token_enc) return null;
  try {
    return { token: decrypt(data.apify_token_enc), actor: data.apify_actor ?? null };
  } catch (e) {
    console.error("解密 Apify token 失敗:", e);
    return null;
  }
}

// 綁定／更新 Apify 憑證（token 加密）。actor 可選。
export async function setApifyCredentials(ownerId: string, token: string, actor?: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert(
      { id: ownerId, apify_token_enc: encrypt(token), apify_actor: actor || null },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// 是否已綁 Apify（給帳號管理頁顯示狀態，不回傳明文）。
export async function hasApifyCredentials(ownerId: string): Promise<{ bound: boolean; actor: string | null }> {
  if (isDemoMode) return { bound: false, actor: null };
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("apify_token_enc, apify_actor").eq("id", ownerId).maybeSingle();
  return { bound: Boolean(data?.apify_token_enc), actor: data?.apify_actor ?? null };
}

// ── AI 子系統：每個使用者自己綁的 Gemini API key ──────────────
export async function getGeminiKey(ownerId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("gemini_api_key_enc").eq("id", ownerId).maybeSingle();
  if (!data?.gemini_api_key_enc) return null;
  try {
    return decrypt(data.gemini_api_key_enc);
  } catch (e) {
    console.error("解密 Gemini key 失敗:", e);
    return null;
  }
}

export async function setGeminiKey(ownerId: string, key: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, gemini_api_key_enc: encrypt(key) }, { onConflict: "id" });
  if (error) throw error;
}

export async function hasGeminiKey(ownerId: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("gemini_api_key_enc").eq("id", ownerId).maybeSingle();
  return Boolean(data?.gemini_api_key_enc);
}

// AI 文案客製化偏好（非機密，明文 jsonb）。讀取一律經 normalizeCopyPrefs 夾成合法值。
export async function getCopyPrefs(ownerId: string): Promise<CopyPrefs> {
  if (isDemoMode) return DEFAULT_COPY_PREFS;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("profiles").select("copy_prefs").eq("id", ownerId).maybeSingle();
  // 查詢失敗（DB 異常）要拋出，不可與「無此列」混為一談而靜默回退預設——
  // 否則表單載入會把預設誤當使用者偏好，存檔後反而覆寫原本設定。
  if (error) throw error;
  return normalizeCopyPrefs(data?.copy_prefs);
}

export async function setCopyPrefs(ownerId: string, prefs: unknown): Promise<CopyPrefs> {
  const clean = normalizeCopyPrefs(prefs);
  if (isDemoMode) return clean;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, copy_prefs: clean }, { onConflict: "id" });
  if (error) throw error;
  return clean;
}

export async function listShopeeAccounts(ownerId: string): Promise<ShopeeAccount[]> {
  if (isDemoMode) return demo.shopeeAccounts;
  const sb = getServiceClient()!;
  const { data } = await sb.from("shopee_accounts").select("id,label,app_id,default_sub_id").eq("owner_id", ownerId);
  return (data ?? []) as ShopeeAccount[];
}

// 取出某使用者的 Shopee 分潤憑證（解密）。member 用自己的金鑰轉連結。
export async function getShopeeCredentials(
  ownerId: string
): Promise<{ appId: string; secret: string; subId: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("shopee_accounts")
    .select("app_id, secret_enc, default_sub_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.secret_enc) return null;
  return { appId: data.app_id, secret: decrypt(data.secret_enc), subId: data.default_sub_id };
}

// 新增 Shopee 分潤帳號（secret 加密後存放）
export async function createShopeeAccount(
  input: { label: string; app_id: string; secret: string; default_sub_id?: string },
  ownerId: string
): Promise<ShopeeAccount> {
  const default_sub_id = input.default_sub_id || "threadspo";
  if (isDemoMode) {
    const acc: ShopeeAccount = { id: randomUUID(), label: input.label, app_id: input.app_id, default_sub_id };
    demo.shopeeAccounts.unshift(acc);
    return acc;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("shopee_accounts")
    .insert({ owner_id: ownerId, label: input.label, app_id: input.app_id, secret_enc: encrypt(input.secret), default_sub_id })
    .select("id,label,app_id,default_sub_id")
    .single();
  if (error) throw error;
  return data as ShopeeAccount;
}

// 監看來源是 owner 專屬。listSources 無參數版供背景排程（取全部啟用來源 = owner 的）。
export async function listSources(ownerId?: string): Promise<Source[]> {
  if (isDemoMode) return demo.sources;
  const sb = getServiceClient()!;
  let q = sb.from("sources").select("*");
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q;
  return (data ?? []) as Source[];
}

export async function createSource(
  input: {
    threads_account_id: string;
    shopee_account_id?: string | null;
    source_username: string;
    poll_interval_minutes?: number;
    auto_publish?: boolean;
    posts_limit?: number;
  },
  ownerId: string
): Promise<Source> {
  const row = {
    owner_id: ownerId,
    threads_account_id: input.threads_account_id,
    shopee_account_id: input.shopee_account_id ?? null,
    source_username: input.source_username.trim().replace(/^@/, ""),
    enabled: true,
    poll_interval_minutes: input.poll_interval_minutes ?? 15,
    auto_publish: input.auto_publish ?? false,
    posts_limit: input.posts_limit ?? 1
  };
  if (isDemoMode) {
    const src: Source = { id: randomUUID(), last_polled_at: null, ...row };
    demo.sources.unshift(src);
    return src;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("sources").insert(row).select("*").single();
  if (error) throw error;
  return data as Source;
}

// 啟用／停用來源（回傳是否有命中該 owner 的 row，達成擁有權檢查）
export async function setSourceEnabled(id: string, ownerId: string, enabled: boolean): Promise<boolean> {
  if (isDemoMode) {
    const s = demo.sources.find((x) => x.id === id);
    if (!s) return false;
    s.enabled = enabled;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("sources")
    .update({ enabled })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteSource(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.sources.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.sources.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("sources")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 設定 Threads 帳號狀態（active=啟用、paused=暫停排程）
export async function setThreadsAccountStatus(
  id: string,
  ownerId: string,
  status: "active" | "paused"
): Promise<boolean> {
  if (isDemoMode) {
    const a = demo.threadsAccounts.find((x) => x.id === id);
    if (!a) return false;
    a.status = status;
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteThreadsAccount(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.threadsAccounts.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.threadsAccounts.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("threads_accounts")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function deleteShopeeAccount(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    const i = demo.shopeeAccounts.findIndex((x) => x.id === id);
    if (i < 0) return false;
    demo.shopeeAccounts.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("shopee_accounts")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 成效統計：近 N 日已發布貼文，依日期/商品/來源/帳號彙總（從自家發布資料，不需外部報表 API）。
export interface PublishInsights {
  days: number;
  totalPublished: number;
  byDay: { date: string; count: number }[];
  byProduct: { name: string; count: number }[];
  bySource: { name: string; count: number }[];
}

export async function getPublishInsights(ownerId: string, days = 30): Promise<PublishInsights> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  let rows: { product_name: string | null; source_id: string | null; published_at: string | null }[];
  if (isDemoMode) {
    rows = demo.drafts
      .filter((d) => d.status === "published")
      .map((d) => ({ product_name: d.product_name ?? null, source_id: d.source_id ?? null, published_at: d.published_at ?? d.created_at }));
  } else {
    const sb = getServiceClient()!;
    const { data } = await sb
      .from("drafts")
      .select("product_name, source_id, published_at")
      .eq("owner_id", ownerId)
      .eq("status", "published")
      .gte("published_at", since)
      .limit(5000); // 上限，避免極大量發布時撐爆記憶體
    rows = data ?? [];
  }

  const dayMap = new Map<string, number>();
  const prodMap = new Map<string, number>();
  const srcMap = new Map<string, number>();
  for (const r of rows) {
    const day = r.published_at
      ? new Date(r.published_at).toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        })
      : "—";
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    const p = r.product_name ?? "（未命名商品）";
    prodMap.set(p, (prodMap.get(p) ?? 0) + 1);
    const s = r.source_id ?? "手動／批次";
    srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

  return {
    days,
    totalPublished: rows.length,
    byDay: [...dayMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    byProduct: top(prodMap, 10),
    bySource: top(srcMap, 10)
  };
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

export async function updateDraftStatus(id: string, status: Draft["status"], patch: Partial<Draft> = {}) {
  // error 訊息截斷到 500 字，避免外部 API 巨量錯誤撐爆欄位
  if (typeof patch.error === "string") patch = { ...patch, error: patch.error.slice(0, 500) };
  if (isDemoMode) {
    const d = demo.drafts.find((x) => x.id === id);
    if (d) Object.assign(d, { status, ...patch });
    return d;
  }
  const sb = getServiceClient()!;
  const { data } = await sb.from("drafts").update({ status, ...patch }).eq("id", id).select().single();
  return data as Draft;
}

// 回收卡住的草稿：publishing 超過 staleMinutes（多半是程序中斷）→ 標 failed 待人工重試。
// 保守不自動改回 approved，避免「其實已發出但 DB 沒寫到」時被重發造成雙貼。
export async function reclaimStalePublishing(staleMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
  if (isDemoMode) {
    let n = 0;
    for (const d of demo.drafts) {
      if (d.status === "publishing" && d.created_at < cutoff) {
        d.status = "failed";
        d.error = "發文程序中斷，請確認後重試";
        n++;
      }
    }
    return n;
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .update({ status: "failed", error: "發文程序中斷，請確認後重試" })
    .eq("status", "publishing")
    .lt("updated_at", cutoff)
    .select("id");
  return (data ?? []).length;
}

// 原子性狀態更新（compare-and-swap）：只有當目前狀態 == expectedStatus 才更新。
export async function updateDraftStatusAtomic(
  id: string,
  status: Draft["status"],
  expectedStatus: Draft["status"],
  patch: Partial<Draft> = {}
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
  const { data } = await sb
    .from("drafts")
    .update({ status, ...patch })
    .eq("id", id)
    .eq("status", expectedStatus)
    .select()
    .maybeSingle();
  return (data as Draft) ?? null;
}

// 發文佇列：取出可發布的草稿（全租戶，發到各自綁定的 Threads 帳號）。背景 worker 用。
export async function listApprovedDrafts(): Promise<Draft[]> {
  const nowIso = new Date().toISOString();
  if (isDemoMode) {
    return demo.drafts
      .filter((d) => d.status === "approved" && (!d.scheduled_at || d.scheduled_at <= nowIso))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("*")
    .eq("status", "approved")
    .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
    .order("created_at", { ascending: true });
  return (data ?? []) as Draft[];
}

export interface PublishPlanRow {
  id: string;
  productName: string | null;
  accountLabel: string;
  etaIso: string | null;
  reason: string;
}

// 發文進度/ETA（給使用者看「排隊中／下次預計幾點／塞車」）。
// 乾跑佇列節奏：依帳號分組，套用保底+抖動間隔與每日上限，算出每篇預計發文時間。
export async function getPublishPlan(ownerId: string): Promise<PublishPlanRow[]> {
  const [drafts, accounts] = await Promise.all([listDrafts(ownerId), listThreadsAccounts(ownerId)]);
  const approved = drafts.filter((d) => d.status === "approved" && d.threads_account_id);
  if (approved.length === 0) return [];
  const labelOf = new Map(accounts.map((a) => [a.id, a.label] as const));
  const now = Date.now();

  // 依帳號分組，組內依排程時間/建立時間排序（與佇列處理順序一致）
  const byAccount = new Map<string, Draft[]>();
  for (const d of approved) {
    const arr = byAccount.get(d.threads_account_id!) ?? [];
    arr.push(d);
    byAccount.set(d.threads_account_id!, arr);
  }

  const rows: PublishPlanRow[] = [];
  for (const [accId, list] of byAccount) {
    list.sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at));
    const state = await getAccountPublishState(accId).catch(() => null);
    if (!state) continue;
    if (state.accountStatus !== "active") {
      for (const d of list) {
        rows.push({ id: d.id, productName: d.product_name ?? null, accountLabel: labelOf.get(accId) ?? "帳號", etaIso: null, reason: `帳號${state.accountStatus}，暫停發文` });
      }
      continue;
    }
    const plan = planAccountQueue({
      drafts: list.map((d) => ({ id: d.id, scheduledAt: d.scheduled_at ?? null })),
      lastPublishedAt: state.lastPublishedAt,
      publishedLast24h: state.publishedLast24h,
      floorMin: env.publishMinGapMinutes,
      jitterMax: env.publishGapJitterMinutes,
      dailyCap: env.publishMaxPerDay,
      accountId: accId,
      now
    });
    const planById = new Map(plan.map((p) => [p.id, p] as const));
    for (const d of list) {
      const p = planById.get(d.id);
      rows.push({
        id: d.id,
        productName: d.product_name ?? null,
        accountLabel: labelOf.get(accId) ?? "帳號",
        etaIso: p?.etaIso ?? null,
        reason: p?.reason ?? "排隊中"
      });
    }
  }
  // 依預計時間排序（null 殿後）
  rows.sort((a, b) => (a.etaIso ?? "9999").localeCompare(b.etaIso ?? "9999"));
  return rows;
}

// 某 Threads 帳號的發文節奏狀態 + 帳號狀態（背景 worker 用）。
// accountStatus：active 才會被發文；error/paused（如展期失敗）會被佇列跳過。
export async function getAccountPublishState(
  threadsAccountId: string
): Promise<{ lastPublishedAt: string | null; publishedLast24h: number; accountStatus: string }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (isDemoMode) {
    const acc = demo.threadsAccounts.find((a) => a.id === threadsAccountId);
    const published = demo.drafts.filter((d) => d.threads_account_id === threadsAccountId && d.status === "published");
    const last = published.map((d) => d.published_at ?? d.created_at).sort().pop();
    return {
      lastPublishedAt: last ?? null,
      publishedLast24h: published.filter((d) => (d.published_at ?? d.created_at) >= since).length,
      accountStatus: acc?.status ?? "active"
    };
  }
  const sb = getServiceClient()!;
  const { data: acc, error: accError } = await sb
    .from("threads_accounts")
    .select("status")
    .eq("id", threadsAccountId)
    .maybeSingle();
  if (accError) throw accError;
  if (!acc) throw new Error(`找不到 ID 為 ${threadsAccountId} 的 Threads 帳號`);
  const { data: latest } = await sb
    .from("drafts")
    .select("published_at")
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1);
  const { count } = await sb
    .from("drafts")
    .select("*", { count: "exact", head: true })
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published")
    .gte("published_at", since);
  return {
    lastPublishedAt: latest?.[0]?.published_at ?? null,
    publishedLast24h: count ?? 0,
    accountStatus: acc.status
  };
}

// 儀表板統計（依登入者隔離）
export async function getDashboardStats(ownerId: string): Promise<{
  threadsAccounts: number;
  sources: number;
  materials: number;
  drafts: { draft: number; approved: number; published: number; failed: number };
  publishedLast24h: number;
  // 需要注意：token 展期失敗(error)、手動暫停(paused) 的帳號數
  accountIssues: { error: number; paused: number };
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (isDemoMode) {
    const by = (s: string) => demo.drafts.filter((d) => d.status === s).length;
    const accBy = (s: string) => demo.threadsAccounts.filter((a) => a.status === s).length;
    return {
      threadsAccounts: demo.threadsAccounts.length,
      sources: demo.sources.filter((s) => s.enabled).length,
      materials: demo.materials.length,
      drafts: { draft: by("draft"), approved: by("approved"), published: by("published"), failed: by("failed") },
      publishedLast24h: demo.drafts.filter((d) => d.status === "published").length,
      accountIssues: { error: accBy("error"), paused: accBy("paused") }
    };
  }
  const sb = getServiceClient()!;
  const count = async (table: string, build: (q: any) => any = (q) => q): Promise<number> => {
    const { count: c } = await build(sb.from(table).select("*", { count: "exact", head: true }).eq("owner_id", ownerId));
    return c ?? 0;
  };
  const [threadsAccounts, sources, materials, draft, approved, published, failed, publishedLast24h, accError, accPaused] =
    await Promise.all([
      count("threads_accounts"),
      count("sources", (q) => q.eq("enabled", true)),
      count("materials"),
      count("drafts", (q) => q.eq("status", "draft")),
      count("drafts", (q) => q.eq("status", "approved")),
      count("drafts", (q) => q.eq("status", "published")),
      count("drafts", (q) => q.eq("status", "failed")),
      count("drafts", (q) => q.eq("status", "published").gte("published_at", since)),
      count("threads_accounts", (q) => q.eq("status", "error")),
      count("threads_accounts", (q) => q.eq("status", "paused"))
    ]);
  return {
    threadsAccounts,
    sources,
    materials,
    drafts: { draft, approved, published, failed },
    publishedLast24h,
    accountIssues: { error: accError, paused: accPaused }
  };
}

// 取某使用者啟用中的 Threads 帳號 + 解密 token（儀表板查額度用）
export async function listActiveThreadsCredentials(
  ownerId: string
): Promise<{ label: string; threadsUserId: string; accessToken: string }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("threads_accounts")
    .select("label, threads_user_id, access_token_enc, status")
    .eq("owner_id", ownerId)
    .eq("status", "active");
  return (data ?? [])
    .filter((r) => r.access_token_enc)
    .map((r) => {
      try {
        return { label: r.label, threadsUserId: r.threads_user_id, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        console.error(`解密帳號 ${r.label} 的 token 失敗:`, e);
        return null;
      }
    })
    .filter((x): x is { label: string; threadsUserId: string; accessToken: string } => x !== null);
}

// 全域取出「即將到期」的 Threads 長期 token（worker 用，跨租戶）。
// thresholdDays：到期前幾天內就先展期（預設 7 天）。
export async function listThreadsTokensToRefresh(
  thresholdDays = 7
): Promise<{ id: string; label: string; accessToken: string }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const cutoff = new Date(Date.now() + thresholdDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("threads_accounts")
    .select("id, label, access_token_enc, token_expires_at")
    .eq("status", "active")
    .not("access_token_enc", "is", null)
    .lte("token_expires_at", cutoff);
  return (data ?? [])
    .map((r) => {
      try {
        return { id: r.id, label: r.label, accessToken: decrypt(r.access_token_enc) };
      } catch (e) {
        console.error(`解密帳號 ${r.label} 的 token 失敗:`, e);
        return null;
      }
    })
    .filter((x): x is { id: string; label: string; accessToken: string } => x !== null);
}

// 更新某帳號的長期 token + 到期日（展期後寫回，加密存放）。
export async function updateThreadsToken(id: string, accessToken: string, expiresAt: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("threads_accounts")
    .update({ access_token_enc: encrypt(accessToken), token_expires_at: expiresAt, status: "active" })
    .eq("id", id);
  if (error) throw error;
}

// 展期失敗時標記帳號為 error，讓前端看得到、停止排程它。
export async function markThreadsAccountError(id: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("threads_accounts").update({ status: "error" }).eq("id", id);
}

// 去重：來源貼文是否已處理過
export async function isPostProcessed(sourceId: string, postId: string): Promise<boolean> {
  if (isDemoMode) return demo.drafts.some((d) => d.source_id === sourceId && d.source_post_id === postId);
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("processed_posts")
    .select("id")
    .eq("source_id", sourceId)
    .eq("post_id", postId)
    .maybeSingle();
  return Boolean(data);
}

export async function markPostProcessed(sourceId: string, postId: string) {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb.from("processed_posts").upsert({ source_id: sourceId, post_id: postId }, { onConflict: "source_id,post_id" });
}
