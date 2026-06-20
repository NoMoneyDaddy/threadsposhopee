import { NextResponse } from "next/server";
import {
  updateDraftStatus,
  updateDraft,
  deleteDraft,
  getDraft,
  getThreadsCredentials,
  getGeminiKey,
  getCopyPrefs,
  requeueReply,
  rescheduleDraft
} from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { normalizeDraftMedia } from "@/lib/media";
import { generateCopy } from "@/services/ai/provider";
import { replyDelayMinutes } from "@/services/publish/reply-timing";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api-error";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 草稿操作：approve / reject / publish / edit / delete / regenerate（只能操作自己的草稿）
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, action } = body;
  if (!id || !action) return NextResponse.json({ ok: false, error: "缺少 id 或 action" }, { status: 400 });

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
    await updateDraftStatus(id, "publishing");
    try {
      if (!draft.threads_account_id) throw new Error("草稿未綁定 Threads 帳號");
      const creds = await getThreadsCredentials(draft.threads_account_id, user.id);
      if (!creds) throw new Error("找不到 Threads 帳號憑證（請先設定 access token）");
      // 留言延遲：>0 表示主文先發、留言之後由 cron 補（防「秒留言」固定行為）
      const replyDelay = draft.reply_text
        ? replyDelayMinutes(draft.id, env.replyDelayFloorMinutes, env.replyDelayJitterMinutes, draft.reply_delay_minutes)
        : 0;
      const deferReply = Boolean(draft.reply_text) && replyDelay > 0;
      const { postId, replyFailed } = await publishToThreads({
        threadsUserId: creds.threadsUserId,
        accessToken: creds.accessToken,
        text: draft.main_text ?? "",
        media: normalizeDraftMedia(draft),
        replyText: draft.reply_text,
        deferReply
      });
      const nowMs = Date.now();
      const replyPatch = deferReply
        ? { reply_status: "pending" as const, reply_due_at: new Date(nowMs + replyDelay * 60000).toISOString() }
        : draft.reply_text
          ? { reply_status: replyFailed ? ("failed" as const) : ("published" as const) }
          : {};
      await updateDraftStatus(id, "published", {
        published_post_id: postId,
        published_at: new Date(nowMs).toISOString(),
        ...replyPatch
      });
      return NextResponse.json({ ok: true, postId, replyDeferred: deferReply });
    } catch (e) {
      // 失敗原因存進草稿供本人在 UI 除錯（owner 限定）；對外回應收斂為固定文案。
      const msg = e instanceof Error ? e.message : String(e);
      await updateDraftStatus(id, "failed", { error: msg });
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
