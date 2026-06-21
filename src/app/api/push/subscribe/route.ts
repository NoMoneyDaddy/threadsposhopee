import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { addPushSubscription } from "@/lib/push-store";
import { isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

// 儲存瀏覽器 Web Push 訂閱（PushSubscription.toJSON 的形狀）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!isPushConfigured()) return NextResponse.json({ ok: false, error: "伺服器未設定推播金鑰" }, { status: 503 });

    const body = await req.json().catch(() => ({}));
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ ok: false, error: "訂閱資料不完整" }, { status: 400 });
    }
    await addPushSubscription(user.id, { endpoint, p256dh, auth });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存推播訂閱失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
