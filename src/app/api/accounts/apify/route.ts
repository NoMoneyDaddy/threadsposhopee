import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setApifyCredentials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { validateApifyToken } from "@/services/validate/keys";

export const dynamic = "force-dynamic";

// 綁定 Apify 憑證（抓取子系統）。任何登入者皆可綁自己的金鑰。token 加密存放。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const actor = typeof body.actor === "string" ? body.actor.trim() : "";
    if (!token) return NextResponse.json({ ok: false, error: "缺少 Apify token" }, { status: 400 });

    const check = await validateApifyToken(token);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 400 });

    await setApifyCredentials(user.id, token, actor || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("apify credential bind failed", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
