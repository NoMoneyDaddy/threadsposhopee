import { NextResponse } from "next/server";
import {
  getMaterial,
  createDraft,
  updateDraftStatus,
  userOwnsThreadsAccount
} from "@/lib/store";
import { getMediaProvider, uploadMediaWith, type MediaProvider } from "@/services/media/upload";
import { withNextSlot } from "@/services/publish/slots";
import { resolveSchedulePicker } from "@/services/publish/smart-schedule";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { getCurrentUser } from "@/lib/auth";
import { publishDraftNow } from "@/services/publish/publish-draft";
import { resolveAffiliateUrl } from "@/services/shopee/affiliate-link";
import { apiError } from "@/lib/api-error";
import { isDemoMode } from "@/lib/env";
import type { DraftMedia, ThreadSegment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MEDIA = 20; // Threads 輪播上限

// 驗證＋中轉一組媒體（主文或留言）：逐項過 SSRF 守衛、再中轉到自綁圖床（失敗沿用原 URL，不擋發文）。
// 無效項（缺 url／型別錯）直接略過；最多取前 20（輪播上限）。
async function processMediaArray(raw: unknown, provider: MediaProvider | null): Promise<DraftMedia[]> {
  if (!Array.isArray(raw)) return [];
  const out: DraftMedia[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const url = typeof (m as { url?: unknown }).url === "string" ? (m as { url: string }).url.trim() : "";
    const t = (m as { type?: unknown }).type;
    const type = t === "video" ? "video" : t === "image" ? "image" : null;
    if (!url || !type) continue;
    let safe: string;
    try {
      safe = assertSafePublicUrl(url).href;
    } catch {
      throw new Error("媒體網址不合法或非公開可存取");
    }
    let cloud = safe;
    if (provider) {
      try {
        cloud = await uploadMediaWith(provider, safe, type);
      } catch {
        cloud = safe;
      }
    }
    out.push({ url: cloud, type });
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}

// 只改寫真正的蝦皮網域（嚴格比對，非 substring）：擋 shopee.evil.com／notshopee.example 之類
// 偽冒域名被當成蝦皮而誤包成 an_redir。涵蓋蝦皮各地區站與分享短網域 shope.ee。
const SHOPEE_HOST_RE = /(^|\.)shopee\.(tw|sg|ph|co\.id|co\.th|com\.my|vn|com\.br)$/;
function isShopeeUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === "shope.ee" || SHOPEE_HOST_RE.test(h);
  } catch {
    return false;
  }
}

const MAX_EXTRA_SEGMENTS = 10; // 更多串文段落（3/n…）數量上限，防濫用

const URL_RE = /https?:\/\/[^\s)]+/g;

// 自動偵測：把正文／留言裡的蝦皮商品連結轉成 owner 的分潤連結。
// resolveAffiliateUrl 對「已是分潤連結（含他人 affiliate_id 或短連結）」會原樣回傳（converted=false），
// 故已是自己分潤 ID 的連結不會被動到；僅未帶分潤的商品連結會被換成自己的。
async function autoAffiliateLinks(ownerId: string, text: string): Promise<string> {
  const targets = Array.from(new Set(text.match(URL_RE) ?? [])).filter(isShopeeUrl);
  if (targets.length === 0) return text;
  // 多連結並行轉換（各自 best-effort，失敗保留原連結，不擋發文）。
  const pairs = await Promise.all(
    targets.map(async (u): Promise<[string, string] | null> => {
      try {
        const r = await resolveAffiliateUrl(ownerId, u);
        return r.converted && r.url && r.url !== u ? [u, r.url] : null;
      } catch {
        return null;
      }
    })
  );
  const map = new Map(pairs.filter((p): p is [string, string] => p !== null));
  if (map.size === 0) return text;
  // 對原文做單次 regex 替換（用完整 URL 當 key），避免逐步 split/join 造成長短網址前綴互相污染。
  return text.replace(URL_RE, (u) => map.get(u) ?? u);
}

// 處理「更多串文段落」（3/n…）：逐段把文字裡的蝦皮連結轉成 owner 分潤連結、媒體過 SSRF＋中轉圖床。
// 過濾掉無內容（無文字且無媒體）的段落。超過 MAX_EXTRA_SEGMENTS 直接拋錯（呼叫端回 400）——
// 不靜默截斷，避免「使用者送出/預覽 11 段、實際只存 10 段」的輸入與結果不一致。
async function processExtraSegments(raw: unknown, ownerId: string, provider: MediaProvider | null): Promise<ThreadSegment[]> {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_EXTRA_SEGMENTS) throw new Error(`串文段落最多 ${MAX_EXTRA_SEGMENTS} 段`);
  const out: ThreadSegment[] = [];
  for (const seg of raw) {
    if (!seg || typeof seg !== "object") continue;
    const rawText = typeof (seg as { text?: unknown }).text === "string" ? (seg as { text: string }).text : "";
    const media = await processMediaArray((seg as { media?: unknown }).media, provider);
    const text = rawText.trim() ? await autoAffiliateLinks(ownerId, rawText) : "";
    const cleanText = text.trim() ? text : null;
    if (cleanText || media.length > 0) out.push({ text: cleanText, media });
  }
  return out;
}

// 快速發文送出：用素材 + 編輯後文案建草稿，依 action 立即發 / 排程 / 存草稿。
// 也支援「自寫直推」：不帶 material_id，直接用 main_text/reply_text（可選 media_url）發。
// body: { material_id?, threads_account_id, main_text, reply_text, action, scheduled_at?, media_url?, media_type? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const { material_id, threads_account_id, action } = body;
    // 外部輸入一律驗型別：id 必須是非空字串
    if (typeof threads_account_id !== "string" || !threads_account_id.trim()) {
      return NextResponse.json({ ok: false, error: "缺少發文帳號" }, { status: 400 });
    }
    if (material_id !== undefined && material_id !== null && typeof material_id !== "string") {
      return NextResponse.json({ ok: false, error: "material_id 型別錯誤" }, { status: 400 });
    }
    if (!["publish", "schedule", "draft", "queue"].includes(action)) {
      return NextResponse.json({ ok: false, error: "不支援的發文動作" }, { status: 400 });
    }
    // 發布版面：'all_in_main'＝影片+圖+連結全發主文、不另發留言；其餘（含未帶）＝拆分（split）。
    if (body.post_mode !== undefined && body.post_mode !== null && !["split", "all_in_main"].includes(body.post_mode)) {
      return NextResponse.json({ ok: false, error: "post_mode 只支援 split 或 all_in_main" }, { status: 400 });
    }
    const postMode: "all_in_main" | null = body.post_mode === "all_in_main" ? "all_in_main" : null;

    // 越權防護：發文帳號必須屬於當前使用者（service-role 繞過 RLS，務必應用層驗證）
    if (!isDemoMode && !(await userOwnsThreadsAccount(threads_account_id, user.id))) {
      return NextResponse.json({ ok: false, error: "無權使用此發文帳號" }, { status: 403 });
    }

    // 排程時間：伺服端驗格式 + 必須是未來（前端驗證可被繞過）
    let scheduledAtIso: string | null = null;
    if (action === "schedule") {
      const raw = typeof body.scheduled_at === "string" ? body.scheduled_at.trim() : "";
      const parsed = raw ? new Date(raw) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ ok: false, error: "排程時間格式不合法" }, { status: 400 });
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json({ ok: false, error: "排程時間必須是未來時間" }, { status: 400 });
      }
      scheduledAtIso = parsed.toISOString();
    }

    // 素材模式：帶 material_id；自寫模式：不帶，需自填正文
    const material = material_id ? await getMaterial(material_id, user.id) : null;
    if (material_id && !material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    const freeMain = typeof body.main_text === "string" ? body.main_text.trim() : "";
    if (!material && !freeMain) {
      return NextResponse.json({ ok: false, error: "請提供發文內容（正文）" }, { status: 400 });
    }

    // 可選自帶媒體：自寫模式必用；素材模式則覆蓋掉爬到的媒體（使用者自上傳一張圖／影片）。
    // 先驗證是安全公開 URL（SSRF），避免發布時才失敗。
    let selfMediaUrl: string | null = null;
    if (typeof body.media_url === "string" && body.media_url.trim()) {
      try {
        selfMediaUrl = assertSafePublicUrl(body.media_url.trim()).href;
      } catch {
        return NextResponse.json({ ok: false, error: "媒體網址不合法或非公開可存取" }, { status: 400 });
      }
    }
    // 媒體類型走白名單，無效值不可靜默當 image（發布時才失敗、難定位）
    if (selfMediaUrl && body.media_type !== undefined && body.media_type !== null && !["image", "video"].includes(body.media_type)) {
      return NextResponse.json({ ok: false, error: "媒體類型只支援 image 或 video" }, { status: 400 });
    }
    const selfMediaType: "image" | "video" | "none" = selfMediaUrl
      ? body.media_type === "video"
        ? "video"
        : "image"
      : "none";

    // 媒體先中轉到自綁圖床（R2/Cloudinary），避免外部短效連結排程時失效。
    // 中轉失敗就沿用原 URL（與 buildMaterialForProduct 一致），不擋發文。
    let selfCloudUrl = selfMediaUrl;
    if (selfMediaUrl && selfMediaType !== "none" && !isDemoMode) {
      try {
        selfCloudUrl = await uploadMediaWith(await getMediaProvider(user.id), selfMediaUrl, selfMediaType);
      } catch {
        selfCloudUrl = selfMediaUrl;
      }
    }
    // 是否以自帶媒體覆蓋素材媒體（素材模式下使用者自上傳時）。
    const overrideMedia = Boolean(selfMediaUrl);

    // 留言延遲逐則覆寫（分）：選填非負整數（0=立即）；未填則用全域預設
    let replyDelayOverride: number | null = null;
    if (body.reply_delay_minutes !== undefined && body.reply_delay_minutes !== null && body.reply_delay_minutes !== "") {
      const raw = body.reply_delay_minutes;
      // 限定 number/string，避免 Number(true)=1、Number([])=0 等非預期型別繞過驗證
      if (typeof raw !== "number" && typeof raw !== "string") {
        return NextResponse.json({ ok: false, error: "留言延遲格式不正確" }, { status: 400 });
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 1440) {
        return NextResponse.json({ ok: false, error: "留言延遲需為 0–1440 的整數分鐘" }, { status: 400 });
      }
      replyDelayOverride = n;
    }

    // 多媒體（主文＋留言）：陣列優先（仿 Threads 多圖/影片輪播）。逐項驗證＋中轉到自綁圖床。
    // getMediaProvider 放 try 外：DB/伺服器錯誤不應被當成「媒體網址不合法」(400)，應往外層 500。
    const mediaProvider = isDemoMode ? null : await getMediaProvider(user.id);
    let mainMediaArr: DraftMedia[];
    let replyMediaArr: DraftMedia[];
    try {
      mainMediaArr = await processMediaArray(body.media, mediaProvider);
      replyMediaArr = await processMediaArray(body.reply_media, mediaProvider);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "媒體網址不合法或非公開可存取" },
        { status: 400 }
      );
    }
    const hasMainArr = mainMediaArr.length > 0;

    // 自動偵測：把正文／留言裡的蝦皮商品連結轉成 owner 分潤連結（已是自己分潤的不動）。
    const baseMain = material ? (typeof body.main_text === "string" ? body.main_text : material.main_text ?? "") : freeMain;
    const baseReply = typeof body.reply_text === "string" ? body.reply_text : material?.reply_text ?? null;
    const finalMain = await autoAffiliateLinks(user.id, baseMain);
    const finalReply = baseReply ? await autoAffiliateLinks(user.id, baseReply) : baseReply;

    // 更多串文段落（3/n…）：有額外段落時，thread_chain 存「完整鏈」＝[留言段, ...額外段]（effectiveChain 會濾空段）；
    // 無額外段落則留空，沿用單則 reply_*（向後相容）。
    let extraSegments: ThreadSegment[];
    try {
      extraSegments = await processExtraSegments(body.thread_chain, user.id, mediaProvider);
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "串文段落媒體網址不合法或非公開可存取" },
        { status: 400 }
      );
    }
    const threadChain: ThreadSegment[] =
      extraSegments.length > 0 ? [{ text: finalReply ?? null, media: replyMediaArr }, ...extraSegments] : [];
    // 非草稿：整條串文鏈每段都受 Threads 500 字上限（含第 0 段＝留言 finalReply，避免超長 reply_text
    // 繞過驗證後卡在 worker 補發失敗）。前端已擋，伺服端再驗。
    if (action !== "draft" && threadChain.some((s) => [...(s.text ?? "")].length > 500)) {
      return NextResponse.json({ ok: false, error: "串文段落超過 500 字上限" }, { status: 400 });
    }

    // draft 待審；其餘（publish/schedule/queue）已核准
    const status = action === "draft" ? "draft" : "approved";
    const make = (scheduled_at: string | null) =>
      createDraft({
        owner_id: user.id,
        material_id: material?.id ?? null,
        threads_account_id,
        product_name: material?.product_name ?? null,
        clean_product_url: material?.clean_product_url ?? null,
        shopee_short_link: material?.affiliate_short_link ?? null,
        commission_rate: material?.commission_rate ?? null,
        commission_checked_at: material?.commission_checked_at ?? null,
        media_type: hasMainArr ? mainMediaArr[0].type : overrideMedia ? selfMediaType : material ? material.media_type : selfMediaType,
        source_media_url: hasMainArr ? mainMediaArr[0].url : overrideMedia ? selfMediaUrl : material ? material.source_media_url : selfMediaUrl,
        cloudinary_media_url: hasMainArr ? mainMediaArr[0].url : overrideMedia ? selfCloudUrl : material ? material.cloudinary_media_url : selfCloudUrl,
        media: hasMainArr ? mainMediaArr : overrideMedia ? [] : material ? material.media ?? [] : [],
        reply_media: replyMediaArr,
        thread_chain: threadChain,
        main_text: finalMain,
        reply_text: finalReply,
        reply_delay_minutes: replyDelayOverride,
        ai_raw: material?.ai_raw ?? null,
        post_mode: postMode,
        status,
        scheduled_at
      });

    let draft;
    let queuedSlot: string | null = null;
    if (action === "queue") {
      // 預設依「成效最佳時段（分散）」自動排進下一個空時段；成效不足 → 退回使用者自訂／系統預設時段。
      // 併發撞格時 withNextSlot 會重算重試。
      const { pick } = await resolveSchedulePicker(user.id, true);
      draft = await withNextSlot(user.id, (slot) => make(slot), 5, pick);
      if (!draft) return NextResponse.json({ ok: false, error: "未來 30 天的時段都排滿了" }, { status: 409 });
      queuedSlot = draft.scheduled_at ?? null;
    } else if (action === "schedule") {
      try {
        draft = await make(scheduledAtIso);
      } catch (e) {
        // migration 0008 唯一索引：同帳號同時段已有排程
        if (e && typeof e === "object" && (e as { code?: string }).code === "23505") {
          return NextResponse.json({ ok: false, error: "該帳號這個時間已有排程，請換個時間" }, { status: 409 });
        }
        throw e;
      }
    } else {
      draft = await make(null);
    }

    if (action === "publish") {
      if (isDemoMode) {
        await updateDraftStatus(draft.id, "published", { published_post_id: "demo_" + Date.now() });
        return NextResponse.json({ ok: true, draft, posted: true, demo: true });
      }
      try {
        const { postId, deferReply } = await publishDraftNow(draft, user.id);
        return NextResponse.json({ ok: true, draft, posted: true, postId, replyDeferred: deferReply });
      } catch (e) {
        return apiError("快速發文失敗", e, { clientMessage: "發布失敗，請稍後再試或檢查帳號設定" });
      }
    }

    return NextResponse.json({ ok: true, draft, posted: false, queuedSlot });
  } catch (e) {
    return apiError("快速發文流程失敗", e);
  }
}
