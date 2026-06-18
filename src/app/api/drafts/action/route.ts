import { NextResponse } from "next/server";
import {
  updateDraftStatus,
  updateDraft,
  deleteDraft,
  getDraft,
  getThreadsCredentials
} from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { generateCopy } from "@/services/ai/provider";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

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
      const copy = await generateCopy({
        productName: draft.product_name ?? "這個好物",
        shopeeShortLink: draft.shopee_short_link ?? "",
        mediaUrl: draft.cloudinary_media_url,
        mediaType: (draft.media_type as "image" | "video" | "none") ?? "none"
      });
      const updated = await updateDraft(id, user.id, {
        main_text: copy.mainText,
        reply_text: copy.replyText,
        ai_raw: copy.raw
      });
      return NextResponse.json({ ok: true, draft: updated });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  if (action === "publish") {
    if (isDemoMode) {
      await updateDraftStatus(id, "published", { published_post_id: "demo_" + Date.now() });
      return NextResponse.json({ ok: true, demo: true });
    }
    await updateDraftStatus(id, "publishing");
    try {
      if (!draft.threads_account_id) throw new Error("草稿未綁定 Threads 帳號");
      const creds = await getThreadsCredentials(draft.threads_account_id);
      if (!creds) throw new Error("找不到 Threads 帳號憑證（請先設定 access token）");
      const { postId } = await publishToThreads({
        threadsUserId: creds.threadsUserId,
        accessToken: creds.accessToken,
        text: draft.main_text ?? "",
        mediaUrl: draft.cloudinary_media_url,
        mediaType: (draft.media_type as "image" | "video" | "none") ?? "none",
        replyText: draft.reply_text
      });
      await updateDraftStatus(id, "published", { published_post_id: postId, published_at: new Date().toISOString() });
      return NextResponse.json({ ok: true, postId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateDraftStatus(id, "failed", { error: msg });
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // 重試：把卡在 publishing（程序中斷）或 failed 的草稿重置回 approved，重新進發文佇列
  if (action === "retry") {
    if (draft.status !== "failed" && draft.status !== "publishing") {
      return NextResponse.json({ ok: false, error: "只有失敗或卡住的草稿可重試" }, { status: 400 });
    }
    await updateDraftStatus(id, "approved", { error: null });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "未知動作" }, { status: 400 });
}
