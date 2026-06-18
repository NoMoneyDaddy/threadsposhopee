import { NextResponse } from "next/server";
import { updateDraftStatus, getDraft, getThreadsCredentials } from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 草稿審核動作：approve / reject / publish
export async function POST(req: Request) {
  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ ok: false, error: "缺少 id 或 action" }, { status: 400 });
  }

  if (action === "reject") {
    await updateDraftStatus(id, "rejected");
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    await updateDraftStatus(id, "approved");
    return NextResponse.json({ ok: true });
  }

  if (action === "publish") {
    // Demo 模式：直接標記為已發布（不打 Threads API）
    if (isDemoMode) {
      await updateDraftStatus(id, "published", { published_post_id: "demo_" + Date.now() });
      return NextResponse.json({ ok: true, demo: true });
    }

    // 正式模式：解密 token → 用已中轉的 Cloudinary 媒體發到 Threads（連結放留言）
    await updateDraftStatus(id, "publishing");
    try {
      const draft = await getDraft(id);
      if (!draft) throw new Error("找不到草稿");
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

      await updateDraftStatus(id, "published", { published_post_id: postId });
      return NextResponse.json({ ok: true, postId });
    } catch (e: any) {
      await updateDraftStatus(id, "failed", { error: e.message });
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: false, error: "未知動作" }, { status: 400 });
}
