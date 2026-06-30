import { NextResponse } from "next/server";
import {
  updateDraftStatus,
  updateDraft,
  deleteDraft,
  getDraft,
  getGeminiKey,
  resolveGeminiModel,
  getCopyPrefs,
  requeueReply,
  rescheduleDraft,
  mainTextUsedByOtherOwner,
  saveDraftToMaterial
} from "@/lib/store";
import { setSponsorPick, swapAffiliateLink } from "@/lib/sponsor";
import { refreshAffiliateLink, itemIdFromCleanUrl } from "@/services/materials/refresh-link";
import { sanitizeThreadSegments } from "@/lib/material-media";
import { createRedirectLink } from "@/lib/redirect-store";
import { extractHttpUrls, replaceUrls } from "@/lib/linkify";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { generateCopy } from "@/services/ai/provider";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { publishDraftNow } from "@/services/publish/publish-draft";
import { isDemoMode } from "@/lib/env";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

// 草稿操作：approve / reject / publish / edit / delete / regenerate（只能操作自己的草稿）
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "缺少或格式錯誤的 id / action" }, { status: 400 });
  }
  const { id, action } = body;
  if (typeof id !== "string" || typeof action !== "string") {
    return NextResponse.json({ ok: false, error: "缺少或格式錯誤的 id / action" }, { status: 400 });
  }

  const draft = await getDraft(id, user.id);
  if (!draft) return NextResponse.json({ ok: false, error: "找不到草稿" }, { status: 404 });

  if (action === "reject") {
    await updateDraftStatus(id, "rejected");
    return NextResponse.json({ ok: true });
  }
  if (action === "approve") {
    await updateDraftStatus(id, "approved");
    return NextResponse.json({ ok: true });
  }
  // 設/取消「今日贊助文」：使用者為該草稿的帳號自選這一篇（可帶指定發文時段 hour）。
  if (action === "set-sponsor" || action === "unset-sponsor") {
    if (!draft.threads_account_id) {
      return NextResponse.json({ ok: false, error: "此草稿尚未綁定發文帳號" }, { status: 400 });
    }
    if (action === "unset-sponsor") {
      await setSponsorPick(draft.threads_account_id, null);
      return NextResponse.json({ ok: true });
    }
    const h = body.hour;
    const hour = typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23 ? h : null;
    await setSponsorPick(draft.threads_account_id, { draftId: id, hour });
    return NextResponse.json({ ok: true });
  }
  if (action === "delete") {
    await deleteDraft(id, user.id);
    return NextResponse.json({ ok: true });
  }
  // 把這篇草稿/貼文存回素材庫：合併主文＋留言媒體（重複標 both）連同文案／分潤連結 upsert 成素材，
  // 之後可重排（排一篇會依 slot 把媒體還原回主文/留言）。無可識別商品時回 400。
  if (action === "save-as-material") {
    try {
      const material = await saveDraftToMaterial(draft, user.id);
      return NextResponse.json({ ok: true, material });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "存成素材失敗" }, { status: 400 });
    }
  }
  if (action === "edit") {
    const mainText = typeof body.main_text === "string" ? body.main_text : draft.main_text;
    const replyText = typeof body.reply_text === "string" ? body.reply_text : draft.reply_text;
    const patch: Partial<Draft> = { main_text: mainText, reply_text: replyText };
    // 留言延遲（分）：null＝清除回全域預設；數字夾在 0..1440。其餘型別忽略（不動原值）。
    if (body.reply_delay_minutes === null) patch.reply_delay_minutes = null;
    else if (typeof body.reply_delay_minutes === "number" && Number.isFinite(body.reply_delay_minutes)) {
      patch.reply_delay_minutes = Math.min(1440, Math.max(0, Math.round(body.reply_delay_minutes)));
    }
    // 媒體指派（主文 media／留言 reply_media）：只接受形狀正確的既有媒體項（url+type）。
    const sanitizeMedia = (arr: unknown): { url: string; type: "image" | "video" }[] =>
      Array.isArray(arr)
        ? arr
            .filter(
              (m): m is { url: string; type: "image" | "video" } =>
                Boolean(m) &&
                typeof (m as { url?: unknown }).url === "string" &&
                Boolean((m as { url: string }).url.trim()) && // url 須 trim 後非空，與發布層一致（不寫回空白媒體）
                ((m as { type?: unknown }).type === "image" || (m as { type?: unknown }).type === "video")
            )
            .map((m) => ({ url: m.url.trim(), type: m.type }))
        : [];
    if (Array.isArray(body.media)) patch.media = sanitizeMedia(body.media);
    if (Array.isArray(body.reply_media)) patch.reply_media = sanitizeMedia(body.reply_media);
    // 同步舊的單一媒體欄位，使其與新的主文 media 陣列一致：否則 media 被清空（例如把某張只留在留言、
    // 取消主文）時，normalizeDraftMedia 會回溯舊 cloudinary/source 欄位，導致重載後又「自動勾回主文」。
    // 以主文媒體首項為準；無主文媒體則一併清空。
    if (patch.media) {
      const primary = patch.media[0] ?? null;
      patch.cloudinary_media_url = primary?.url ?? null;
      patch.source_media_url = primary?.url ?? null;
      patch.media_type = primary?.type ?? "none";
    }
    // 手動設定分潤連結（覆寫自動轉換）：驗證為安全公開網址後，更新欄位並把舊連結就地換成新連結。
    if (typeof body.shopee_short_link === "string" && body.shopee_short_link.trim()) {
      let link: string;
      try {
        link = assertSafePublicUrl(body.shopee_short_link.trim()).href;
      } catch {
        return NextResponse.json({ ok: false, error: "分潤連結不合法或非公開網址" }, { status: 400 });
      }
      const old = draft.shopee_short_link;
      patch.shopee_short_link = link;
      if (old && old !== link) {
        patch.main_text = mainText ? swapAffiliateLink(mainText, old, link) : mainText;
        patch.reply_text = replyText ? swapAffiliateLink(replyText, old, link) : replyText;
      }
    }
    // 共用編輯器送來「完整串文鏈」（[0]＝留言 2/n，其餘 3/n+）時直接採用（清洗、丟空段）；
    // 鏈補發中（cursor>0）不動鏈，避免索引左移跳段。空陣列＝清鏈、發布時沿用 reply_*。
    if (Array.isArray(body.thread_chain) && (draft.thread_cursor ?? 0) === 0) {
      patch.thread_chain = sanitizeThreadSegments(body.thread_chain);
    } else if (Array.isArray(draft.thread_chain) && draft.thread_chain.length > 0 && (draft.thread_cursor ?? 0) === 0) {
      // 舊路徑（只編留言、未送整鏈）：同步第 0 段＝編輯後的留言，後續段落保留不動。
      const firstMedia = patch.reply_media ?? draft.thread_chain[0]?.media ?? draft.reply_media ?? [];
      patch.thread_chain = [{ text: patch.reply_text ?? null, media: firstMedia }, ...draft.thread_chain.slice(1)];
    }
    const updated = await updateDraft(id, user.id, patch);
    if (!updated) return NextResponse.json({ ok: false, error: "更新草稿失敗" }, { status: 400 });
    return NextResponse.json({ ok: true, draft: updated });
  }
  if (action === "shorten") {
    // 一鍵套轉址：把草稿內連結轉成 go2read 短連結（中轉頁可附分潤）。
    const shortBase = process.env.NEXT_PUBLIC_SHORT_DOMAIN || new URL(req.url).origin;
    const urls = [...new Set([...extractHttpUrls(draft.main_text), ...extractHttpUrls(draft.reply_text)])]
      // 跳過已是本短連結者，避免重複轉址
      .filter((u) => !u.includes(`${shortBase}/r/`) && !u.includes("/r/"));
    if (urls.length === 0) return NextResponse.json({ ok: false, error: "草稿內沒有可轉換的連結" }, { status: 200 });

    // 並行建立（每筆會 best-effort 抓 OG 預覽，最長 ~6s）；改序列→並行避免 N 筆線性累積觸發請求逾時。
    // 加硬上限避免單次請求處理過多連結。
    const MAX_SHORTEN = 20;
    const map: Record<string, string> = {};
    const results = await Promise.all(
      urls.slice(0, MAX_SHORTEN).map(async (url) => {
        try {
          const code = await createRedirectLink(user.id, { sourceUrl: url });
          return [url, `${shortBase}/r/${code}`] as const;
        } catch {
          // 單一 URL 不合法（SSRF/協定）→ 略過，不擋其他
          return null;
        }
      })
    );
    for (const r of results) if (r) map[r[0]] = r[1];
    if (Object.keys(map).length === 0) return NextResponse.json({ ok: false, error: "連結無法轉換" }, { status: 200 });

    const updated = await updateDraft(id, user.id, {
      main_text: draft.main_text ? replaceUrls(draft.main_text, map) : draft.main_text,
      reply_text: draft.reply_text ? replaceUrls(draft.reply_text, map) : draft.reply_text
    });
    if (!updated) return NextResponse.json({ ok: false, error: "更新草稿失敗" }, { status: 400 });
    // 超過上限被略過的連結數，讓前端能提示使用者尚有連結未轉換。
    return NextResponse.json({
      ok: true,
      draft: updated,
      shortened: Object.keys(map).length,
      skipped: Math.max(0, urls.length - MAX_SHORTEN)
    });
  }
  if (action === "refresh-link") {
    // 刷新分潤連結：用當前 Shopee 金鑰＋當前 Sub id 設定，依乾淨商品連結重產，並把舊連結就地換成新連結。
    if (!draft.clean_product_url) {
      return NextResponse.json({ ok: false, error: "此草稿沒有乾淨商品連結，無法刷新（請改用素材重排）" }, { status: 400 });
    }
    let link: string;
    let subIdNote: string | null;
    try {
      const r = await refreshAffiliateLink(user.id, {
        cleanUrl: draft.clean_product_url,
        itemId: itemIdFromCleanUrl(draft.clean_product_url),
        accountTag: null
      });
      link = r.link;
      subIdNote = r.subId;
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
    const old = draft.shopee_short_link;
    const patch: Partial<Draft> = { shopee_short_link: link };
    if (old && old !== link) {
      patch.main_text = draft.main_text ? swapAffiliateLink(draft.main_text, old, link) : draft.main_text;
      patch.reply_text = draft.reply_text ? swapAffiliateLink(draft.reply_text, old, link) : draft.reply_text;
      // 串文鏈尚未開始補發（cursor 0）時同步第 0 段（留言段）的連結，避免發布時沿用舊鏈連結。
      if (Array.isArray(draft.thread_chain) && draft.thread_chain.length > 0 && (draft.thread_cursor ?? 0) === 0) {
        const seg0 = draft.thread_chain[0];
        patch.thread_chain = [
          { text: seg0?.text ? swapAffiliateLink(seg0.text, old, link) : seg0?.text ?? null, media: seg0?.media ?? [] },
          ...draft.thread_chain.slice(1)
        ];
      }
    }
    const updated = await updateDraft(id, user.id, patch);
    if (!updated) return NextResponse.json({ ok: false, error: "更新草稿失敗" }, { status: 400 });
    return NextResponse.json({ ok: true, draft: updated, subId: subIdNote });
  }
  if (action === "regenerate") {
    try {
      const [geminiKey, copyPrefs, geminiModel] = await Promise.all([getGeminiKey(user.id), getCopyPrefs(user.id), resolveGeminiModel(user.id)]);
      if (!geminiKey) return NextResponse.json({ ok: false, error: "請先到帳號管理綁定你自己的 Gemini 金鑰" }, { status: 400 });
      const copy = await generateCopy(
        {
          productName: draft.product_name ?? "這個好物",
          shopeeShortLink: draft.shopee_short_link ?? "",
          mediaUrl: draft.cloudinary_media_url,
          mediaType: (draft.media_type as "image" | "video" | "none") ?? "none"
        },
        geminiKey,
        copyPrefs,
        geminiModel
      );
      const updated = await updateDraft(id, user.id, {
        main_text: copy.mainText,
        reply_text: copy.replyText,
        ai_raw: copy.raw
      });
      return NextResponse.json({ ok: true, draft: updated });
    } catch (e) {
      return apiError("草稿文案重產失敗", e, { clientMessage: "文案產生失敗，請稍後再試" });
    }
  }

  // A/B 文案：一次產生多個版本供人工挑選（不覆寫草稿；套用走既有 edit）。
  // 防濫用：版本數限 2–3；並行產生，部分失敗仍回傳已成功的版本。
  if (action === "variants") {
    const n = Math.min(3, Math.max(2, Number(body.count) || 2));
    try {
      const [geminiKey, copyPrefs, geminiModel] = await Promise.all([getGeminiKey(user.id), getCopyPrefs(user.id), resolveGeminiModel(user.id)]);
      if (!geminiKey) return NextResponse.json({ ok: false, error: "請先到帳號管理綁定你自己的 Gemini 金鑰" }, { status: 400 });
      const ctx = {
        productName: draft.product_name ?? "這個好物",
        shopeeShortLink: draft.shopee_short_link ?? "",
        mediaUrl: draft.cloudinary_media_url,
        mediaType: (draft.media_type as "image" | "video" | "none") ?? "none"
      };
      const results = await Promise.all(
        Array.from({ length: n }, () => generateCopy(ctx, geminiKey, copyPrefs, geminiModel).catch(() => null))
      );
      const variants = results
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .map((c) => ({ mainText: c.mainText, replyText: c.replyText }));
      if (variants.length === 0) {
        return NextResponse.json({ ok: false, error: "文案產生失敗，請稍後再試" }, { status: 502 });
      }
      return NextResponse.json({ ok: true, variants });
    } catch (e) {
      return apiError("A/B 文案產生失敗", e, { clientMessage: "文案產生失敗，請稍後再試" });
    }
  }

  if (action === "publish") {
    // 人工按「核准並發布」即視為核准；但已發布／發布中／已退回的不可再次發布，避免重複貼文
    if (draft.status === "published" || draft.status === "publishing" || draft.status === "rejected") {
      return NextResponse.json({ ok: false, error: `草稿狀態為「${draft.status}」，無法發布` }, { status: 400 });
    }
    // 禁止不同使用者用相同文案（避免重複內容被降觸及/封號）。
    if (await mainTextUsedByOtherOwner(draft.main_text, user.id)) {
      return NextResponse.json(
        { ok: false, error: "這段文案已有其他使用者發布過，請先改寫（可用 AI 重寫）再發。" },
        { status: 409 }
      );
    }
    if (isDemoMode) {
      await updateDraftStatus(id, "published", { published_post_id: "demo_" + Date.now() });
      return NextResponse.json({ ok: true, demo: true });
    }
    try {
      // publishDraftNow 內部設 publishing→published／失敗落 failed（含失敗原因供本人除錯）；
      // 對外回應收斂為固定文案，原始錯誤只進 log。
      const { postId, deferReply } = await publishDraftNow(draft, user.id);
      return NextResponse.json({ ok: true, postId, replyDeferred: deferReply });
    } catch (e) {
      return apiError("草稿發布失敗", e, { clientMessage: "發布失敗，請稍後再試或檢查帳號設定" });
    }
  }

  // 改排程時間：只允許佇列中（approved）的草稿，需未來時間；撞同帳號同時段回 409
  if (action === "reschedule") {
    const iso = typeof body.scheduled_at === "string" ? body.scheduled_at : "";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return NextResponse.json({ ok: false, error: "時間格式錯誤" }, { status: 400 });
    if (t <= Date.now()) return NextResponse.json({ ok: false, error: "請選擇未來時間" }, { status: 400 });
    const r = await rescheduleDraft(id, user.id, new Date(t).toISOString());
    if (!r.ok) {
      return r.reason === "taken"
        ? NextResponse.json({ ok: false, error: "該時段已有貼文，請換個時間" }, { status: 409 })
        : NextResponse.json({ ok: false, error: "只有佇列中的草稿可改時間" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, draft: r.draft });
  }

  // 重試補留言：把「補留言失敗」的草稿重排回 pending，下輪 cron 立即重補（主文已發、不重貼）
  if (action === "retry-reply") {
    if (draft.reply_status !== "failed") {
      return NextResponse.json({ ok: false, error: "只有補留言失敗的草稿可重試" }, { status: 400 });
    }
    const ok = await requeueReply(id, user.id);
    if (!ok) return NextResponse.json({ ok: false, error: "重排失敗（狀態已變動）" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }

  // 重試：把 failed、卡住的 publishing、或人工確認「未發出」的 needs_verification
  // 重置回 approved，重新進發文佇列。
  if (action === "retry") {
    if (draft.status !== "failed" && draft.status !== "publishing" && draft.status !== "needs_verification") {
      return NextResponse.json({ ok: false, error: "只有失敗、卡住或待確認的草稿可重試" }, { status: 400 });
    }
    await updateDraftStatus(id, "approved", { error: null });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "未知動作" }, { status: 400 });
}
