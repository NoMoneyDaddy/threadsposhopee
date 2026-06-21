import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { setRepostLimits } from "@/lib/store";
import { normalizeRepostLimitsInput } from "@/lib/repost-limits";

export const dynamic = "force-dynamic";

// 每位使用者自訂「同素材重複發文上限」（單帳號／跨帳號合計）。0＝不限。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const n = normalizeRepostLimitsInput(body);
    if (!n.ok) return NextResponse.json({ ok: false, error: n.error }, { status: 400 });
    await setRepostLimits(user.id, { perAccount: n.perAccount, total: n.total });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存重發上限失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
