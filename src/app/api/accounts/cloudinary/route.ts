import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setUserCloudinary } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { parseCloudinaryInput } from "@/services/media/cloudinary-config";

export const dynamic = "force-dynamic";

// 綁定各人自己的 Cloudinary（素材中轉進自己雲端）。cloud name + unsigned upload preset 皆非機密。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "請求格式錯誤（非合法 JSON）" }, { status: 400 });
    }
    const parsed = parseCloudinaryInput((body as { cloud?: unknown })?.cloud, (body as { preset?: unknown })?.preset);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

    await setUserCloudinary(user.id, parsed.cloud, parsed.preset);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存 Cloudinary 設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
