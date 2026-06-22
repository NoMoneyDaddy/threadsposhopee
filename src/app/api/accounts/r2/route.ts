import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setUserR2 } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { parseR2Input } from "@/services/media/r2-config";

export const dynamic = "force-dynamic";

// 綁定各人自己的 Cloudflare R2 圖床（素材進自己雲端）。access key/secret 加密存；空白＝沿用既有。
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
    const b = body as { accountId?: unknown; bucket?: unknown; publicBase?: unknown; accessKeyId?: unknown; secretAccessKey?: unknown };
    const parsed = parseR2Input(b);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

    const accessKeyId = typeof b.accessKeyId === "string" ? b.accessKeyId.trim() : "";
    const secretAccessKey = typeof b.secretAccessKey === "string" ? b.secretAccessKey.trim() : "";
    if (accessKeyId.length > 200 || secretAccessKey.length > 400) {
      return NextResponse.json({ ok: false, error: "金鑰格式不正確" }, { status: 400 });
    }
    // 首次綁定（有 accountId）必須一併提供 key/secret；之後更新可留空沿用。
    if (parsed.accountId && (!accessKeyId || !secretAccessKey)) {
      // 允許「只改網域/bucket」：若資料庫已有金鑰，前端留空即可；這裡只在「明顯首綁卻沒填」時擋。
      // 用 header 區分太重；改為若兩者皆空且看似首綁則提示。簡化：兩者皆空時放行（沿用既有），
      // 但若只填其一則視為誤填。
      if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        return NextResponse.json({ ok: false, error: "Access Key ID 與 Secret 需一起填寫" }, { status: 400 });
      }
    }

    await setUserR2(user.id, {
      accountId: parsed.accountId,
      bucket: parsed.bucket,
      publicBase: parsed.publicBase,
      accessKeyId,
      secretAccessKey
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存 R2 設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
