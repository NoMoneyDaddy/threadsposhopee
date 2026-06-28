import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMediaProvider, uploadBytesWith } from "@/services/media/upload";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_IMAGE = 20 * 1024 * 1024; // 20MB
const MAX_VIDEO = 200 * 1024 * 1024; // 200MB

// 使用者本機上傳媒體：把檔案經 server 中轉到使用者自綁的圖床（R2 或 Cloudinary），回傳穩定公開 URL。
// 相容所有圖床（Cloudinary 客戶端直傳之外，R2 也能用），讓發文／素材頁的上傳按鈕對 R2 使用者也有效。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });

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
    const type: "image" | "video" = file.type.startsWith("video") ? "video" : "image";
    const max = type === "video" ? MAX_VIDEO : MAX_IMAGE;
    if (file.size > max) {
      return NextResponse.json({ ok: false, error: `檔案過大（上限 ${type === "video" ? 200 : 20}MB）` }, { status: 413 });
    }
    const contentType = file.type || (type === "video" ? "video/mp4" : "image/jpeg");
    const body = Buffer.from(await file.arrayBuffer());
    const url = await uploadBytesWith(provider, body, contentType, type);
    return NextResponse.json({ ok: true, url, type });
  } catch (e) {
    return apiError("本機上傳失敗", e, { clientMessage: "上傳失敗，請稍後再試" });
  }
}
