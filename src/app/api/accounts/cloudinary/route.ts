import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setUserCloudinary } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { parseCloudinaryInput } from "@/services/media/cloudinary-config";
import { validateCloudinaryUnsigned } from "@/services/validate/keys";

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

    // API key/secret 為選填（給用量面板用）：限基本格式，過長視為誤填。
    const rawKey = (body as { apiKey?: unknown })?.apiKey;
    const rawSecret = (body as { apiSecret?: unknown })?.apiSecret;
    const apiKey = typeof rawKey === "string" ? rawKey.trim() : "";
    const apiSecret = typeof rawSecret === "string" ? rawSecret.trim() : "";
    if (apiKey.length > 200 || apiSecret.length > 200) {
      return NextResponse.json({ ok: false, error: "API 金鑰格式不正確" }, { status: 400 });
    }

    // 綁定（非清除）時實打一次 unsigned 上傳驗證 cloud+preset 有效；明確被拒才擋，第三方故障則放行。
    if (parsed.cloud && parsed.preset) {
      const check = await validateCloudinaryUnsigned(parsed.cloud, parsed.preset);
      if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 400 });
    }

    await setUserCloudinary(user.id, parsed.cloud, parsed.preset, apiKey, apiSecret);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存 Cloudinary 設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
