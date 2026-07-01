import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMediaProvider, uploadBytesWith } from "@/services/media/upload";
import { checkUploadFile } from "@/lib/media-mime";
import { apiError } from "@/lib/api-error";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 使用者本機上傳媒體：把檔案經 server 中轉到使用者自綁的圖床（R2 或 Cloudinary），回傳穩定公開 URL。
// 相容所有圖床（Cloudinary 客戶端直傳之外，R2 也能用），讓發文／素材頁的上傳按鈕對 R2 使用者也有效。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
    const rl = await rateLimit("media_upload", user.id, 60, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const provider = await getMediaProvider(user.id);
    if (provider.kind === "none") {
      return NextResponse.json(
        { ok: false, error: "請先到帳號管理綁定圖床（Cloudinary 或 Cloudflare R2）才能本機上傳" },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "缺少檔案" }, { status: 400 });
    }
    // MIME 白名單＋大小上限（前後端共用 helper）：只放行明確圖片／影片，其餘拒絕（不臆測未知型別）。
    // 依穩定 code 對應狀態碼（too_large→413、unsupported_type→415），不靠文案判斷避免改字壞掉。
    const checked = checkUploadFile(file.type, file.size, file.name);
    if ("error" in checked) {
      const status = checked.code === "too_large" ? 413 : 415;
      return NextResponse.json({ ok: false, error: checked.error }, { status });
    }
    const body = Buffer.from(await file.arrayBuffer());
    const url = await uploadBytesWith(provider, body, file.type, checked.type);
    return NextResponse.json({ ok: true, url, type: checked.type });
  } catch (e) {
    return apiError("本機上傳失敗", e, { clientMessage: "上傳失敗，請稍後再試" });
  }
}
