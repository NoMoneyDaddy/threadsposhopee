import { NextResponse } from "next/server";
import {
  updateDraftStatus,
  updateDraft,
  deleteDraft,
  getDraft,
  getGeminiKey,
  getCopyPrefs,
  requeueReply,
  rescheduleDraft
} from "@/lib/store";
import { generateCopy } from "@/services/ai/provider";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { publishDraftNow } from "@/services/publish/publish-draft";
import { isDemoMode } from "@/lib/env";

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
  if (action === "delete") {
    await deleteDraft(id, user.id);
    return NextResponse.json({ ok: true });
  }
  if (action === "edit") {
    const updated = await updateDraft(id, user.id, {
      main_text: typeof body.main_text === "string" ? body.main_text : draft.main_text,
      reply_text: typeof body.reply_text === "string" ? body.reply_text : draft.reply_text
    });
    if (!updated) return NextResponse.json({ ok: false, error: "更新草稿失敗" }, { status: 400 });
    return NextResponse.json({ ok: true, draft: updated });
  }
  if (action === "regenerate") {
    try {
      const [geminiKey, copyPrefs] = await Promise.all([getGeminiKey(user.id), getCopyPrefs(user.id)]);
      if (!geminiKey) return NextResponse.json({ ok: false, error: "請先到帳號管理綁定你自己的 Gemini 金鑰" }, { status: 400 });
      const copy = await generateCopy(
        {
          productName: draft.product_name ?? "這個好物",
          shopeeShortLink: draft.shopee_short_link ?? "",
          mediaUrl: draft.cloudinary_media_url,
          mediaType: (draft.media_type as "image" | "video" | "none") ?? "none"
        },
        geminiKey,
        copyPrefs
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
      const [geminiKey, copyPrefs] = await Promise.all([getGeminiKey(user.id), getCopyPrefs(user.id)]);
      if (!geminiKey) return NextResponse.json({ ok: false, error: "請先到帳號管理綁定你自己的 Gemini 金鑰" }, { status: 400 });
      const ctx = {
        productName: draft.product_name ?? "這個好物",
        shopeeShortLink: draft.shopee_short_link ?? "",
        mediaUrl: draft.cloudinary_media_url,
        mediaType: (draft.media_type as "image" | "video" | "none") ?? "none"
      };
      const results = await Promise.all(
        Array.from({ length: n }, () => generateCopy(ctx, geminiKey, copyPrefs).catch(() => null))
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
