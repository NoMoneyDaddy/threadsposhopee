import { NextResponse } from "next/server";
import {
  getMaterial,
  createDraft,
  updateDraftStatus,
  userOwnsThreadsAccount,
  getUserCloudinary,
  getPublishPrefs
} from "@/lib/store";
import { uploadToCloudinary } from "@/services/media/cloudinary";
import { withNextSlot, nextOpenSlot } from "@/services/publish/slots";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { getCurrentUser } from "@/lib/auth";
import { publishDraftNow } from "@/services/publish/publish-draft";
import { apiError } from "@/lib/api-error";
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

    // 自寫模式的可選媒體：先驗證是安全公開 URL（SSRF），避免發布時才失敗
    let selfMediaUrl: string | null = null;
    if (!material && typeof body.media_url === "string" && body.media_url.trim()) {
      try {
        selfMediaUrl = assertSafePublicUrl(body.media_url.trim()).href;
      } catch {
        return NextResponse.json({ ok: false, error: "媒體網址不合法或非公開可存取" }, { status: 400 });
      }
    }
    // 媒體類型走白名單，無效值不可靜默當 image（發布時才失敗、難定位）
    if (selfMediaUrl && body.media_type !== undefined && !["image", "video"].includes(body.media_type)) {
      return NextResponse.json({ ok: false, error: "媒體類型只支援 image 或 video" }, { status: 400 });
    }
    const selfMediaType: "image" | "video" | "none" = selfMediaUrl
      ? body.media_type === "video"
        ? "video"
        : "image"
      : "none";

    // 媒體先中轉到 Cloudinary（自綁優先、退回 env），避免外部短效連結排程時失效。
    // 中轉失敗就沿用原 URL（與 buildMaterialForProduct 一致），不擋發文。
    let selfCloudUrl = selfMediaUrl;
    if (selfMediaUrl && selfMediaType !== "none" && !isDemoMode) {
      try {
        selfCloudUrl = await uploadToCloudinary(selfMediaUrl, selfMediaType, await getUserCloudinary(user.id));
      } catch {
        selfCloudUrl = selfMediaUrl;
      }
    }

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
        cloudinary_media_url: material ? material.cloudinary_media_url : selfCloudUrl,
        main_text: material ? (typeof body.main_text === "string" ? body.main_text : material.main_text) : freeMain,
        reply_text: typeof body.reply_text === "string" ? body.reply_text : material?.reply_text ?? null,
        reply_delay_minutes: replyDelayOverride,
        ai_raw: material?.ai_raw ?? null,
        status,
        scheduled_at
      });

    let draft;
    let queuedSlot: string | null = null;
    if (action === "queue") {
      // 自動排進下一個空時段（使用者自訂時段優先）；併發撞格時 withNextSlot 會重算重試
      const prefs = await getPublishPrefs(user.id).catch(() => null);
      const slots = prefs?.slots;
      draft = await withNextSlot(user.id, (slot) => make(slot), 5, (taken) => nextOpenSlot(taken, Date.now(), 30, slots));
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
