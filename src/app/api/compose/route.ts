import { NextResponse } from "next/server";
import { getMaterial, createDraft, getThreadsCredentials, updateDraftStatus } from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 快速發文送出：用素材 + 編輯後文案建草稿，依 action 立即發 / 排程 / 存草稿。
// body: { material_id, threads_account_id, main_text, reply_text, action, scheduled_at? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const { material_id, threads_account_id, action } = body;
    if (!material_id || !threads_account_id) {
      return NextResponse.json({ ok: false, error: "缺少素材或發文帳號" }, { status: 400 });
    }
    if (!["publish", "schedule", "draft"].includes(action)) {
      return NextResponse.json({ ok: false, error: "不支援的發文動作" }, { status: 400 });
    }
    if (action === "schedule" && !body.scheduled_at) {
      return NextResponse.json({ ok: false, error: "排程發布必須提供排程時間" }, { status: 400 });
    }

    const material = await getMaterial(material_id, user.id);
    if (!material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    // draft = 待審；schedule = 已核准 + 排定時間（發文 worker 到時發）；publish = 立即發
    const status = action === "draft" ? "draft" : "approved";
    const scheduled_at = action === "schedule" ? body.scheduled_at || null : null;

    const draft = await createDraft({
      owner_id: user.id,
      material_id: material.id,
      threads_account_id,
      product_name: material.product_name,
      clean_product_url: material.clean_product_url,
      shopee_short_link: material.affiliate_short_link,
      media_type: material.media_type,
      source_media_url: material.source_media_url,
      cloudinary_media_url: material.cloudinary_media_url,
      main_text: typeof body.main_text === "string" ? body.main_text : material.main_text,
      reply_text: typeof body.reply_text === "string" ? body.reply_text : material.reply_text,
      ai_raw: material.ai_raw,
      status,
      scheduled_at
    });

    if (action === "publish") {
      if (isDemoMode) {
        await updateDraftStatus(draft.id, "published", { published_post_id: "demo_" + Date.now() });
        return NextResponse.json({ ok: true, draft, posted: true, demo: true });
      }
      await updateDraftStatus(draft.id, "publishing");
      try {
        const creds = await getThreadsCredentials(threads_account_id);
        if (!creds) throw new Error("找不到 Threads 帳號憑證");
        const { postId } = await publishToThreads({
          threadsUserId: creds.threadsUserId,
          accessToken: creds.accessToken,
          text: draft.main_text ?? "",
          mediaUrl: draft.cloudinary_media_url,
          mediaType: (draft.media_type as "image" | "video" | "none") ?? "none",
          replyText: draft.reply_text
        });
        await updateDraftStatus(draft.id, "published", {
          published_post_id: postId,
          published_at: new Date().toISOString()
        });
        return NextResponse.json({ ok: true, draft, posted: true, postId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await updateDraftStatus(draft.id, "failed", { error: msg });
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, draft, posted: false });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
