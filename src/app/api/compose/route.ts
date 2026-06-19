import { NextResponse } from "next/server";
import { getMaterial, createDraft, getThreadsCredentials, updateDraftStatus } from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { normalizeDraftMedia } from "@/lib/media";
import { withNextSlot } from "@/services/publish/slots";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 快速發文送出：用素材 + 編輯後文案建草稿，依 action 立即發 / 排程 / 存草稿。
// 也支援「自寫直推」：不帶 material_id，直接用 main_text/reply_text（可選 media_url）發。
// body: { material_id?, threads_account_id, main_text, reply_text, action, scheduled_at?, media_url?, media_type? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const { material_id, threads_account_id, action } = body;
    if (!threads_account_id) {
      return NextResponse.json({ ok: false, error: "缺少發文帳號" }, { status: 400 });
    }
    if (!["publish", "schedule", "draft", "queue"].includes(action)) {
      return NextResponse.json({ ok: false, error: "不支援的發文動作" }, { status: 400 });
    }
    if (action === "schedule" && !body.scheduled_at) {
      return NextResponse.json({ ok: false, error: "排程發布必須提供排程時間" }, { status: 400 });
    }

    // 素材模式：帶 material_id；自寫模式：不帶，需自填正文
    const material = material_id ? await getMaterial(material_id, user.id) : null;
    if (material_id && !material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    const freeMain = typeof body.main_text === "string" ? body.main_text.trim() : "";
    if (!material && !freeMain) {
      return NextResponse.json({ ok: false, error: "請提供發文內容（正文）" }, { status: 400 });
    }

    // 自寫模式的可選媒體：先驗證是安全公開 URL（SSRF），避免發布時才失敗
    let selfMediaUrl: string | null = null;
    if (!material && typeof body.media_url === "string" && body.media_url.trim()) {
      try {
        selfMediaUrl = assertSafePublicUrl(body.media_url.trim()).href;
      } catch {
        return NextResponse.json({ ok: false, error: "媒體網址不合法或非公開可存取" }, { status: 400 });
      }
    }
    const selfMediaType: "image" | "video" | "none" = selfMediaUrl
      ? body.media_type === "video"
        ? "video"
        : "image"
      : "none";

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
        media_type: material ? material.media_type : selfMediaType,
        source_media_url: material ? material.source_media_url : selfMediaUrl,
        cloudinary_media_url: material ? material.cloudinary_media_url : selfMediaUrl,
        main_text: material ? (typeof body.main_text === "string" ? body.main_text : material.main_text) : freeMain,
        reply_text: typeof body.reply_text === "string" ? body.reply_text : material?.reply_text ?? null,
        ai_raw: material?.ai_raw ?? null,
        status,
        scheduled_at
      });

    let draft;
    let queuedSlot: string | null = null;
    if (action === "queue") {
      // 自動排進下一個空時段；併發撞格時 withNextSlot 會重算重試
      draft = await withNextSlot(user.id, (slot) => make(slot));
      if (!draft) return NextResponse.json({ ok: false, error: "未來 30 天的時段都排滿了" }, { status: 409 });
      queuedSlot = draft.scheduled_at ?? null;
    } else if (action === "schedule") {
      try {
        draft = await make(body.scheduled_at || null);
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
      await updateDraftStatus(draft.id, "publishing");
      try {
        const creds = await getThreadsCredentials(threads_account_id);
        if (!creds) throw new Error("找不到 Threads 帳號憑證");
        const { postId } = await publishToThreads({
          threadsUserId: creds.threadsUserId,
          accessToken: creds.accessToken,
          text: draft.main_text ?? "",
          media: normalizeDraftMedia(draft),
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

    return NextResponse.json({ ok: true, draft, posted: false, queuedSlot });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
