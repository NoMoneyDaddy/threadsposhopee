import { NextResponse } from "next/server";
import { updateDraftStatus, getDraft, getThreadsCredentials } from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 草稿審核動作：approve / reject / publish（只能操作自己的草稿）
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ ok: false, error: "缺少 id 或 action" }, { status: 400 });
  }

  // 先確認草稿屬於這個使用者
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

  return NextResponse.json({ ok: false, error: "未知動作" }, { status: 400 });
}
