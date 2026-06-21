import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { setNotifyPrefs } from "@/lib/store";
import { normalizeNotifyPrefs } from "@/lib/notify-prefs";

export const dynamic = "force-dynamic";

// 每位使用者的通知個別開關。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await setNotifyPrefs(user.id, normalizeNotifyPrefs(body?.prefs));
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存通知偏好失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
