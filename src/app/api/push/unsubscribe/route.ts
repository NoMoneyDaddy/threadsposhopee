import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { deletePushSubscription } from "@/lib/push-store";

export const dynamic = "force-dynamic";

// 移除瀏覽器 Web Push 訂閱（依 endpoint，owner 過濾）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const endpoint = body?.endpoint;
    if (typeof endpoint !== "string" || !endpoint) {
      return NextResponse.json({ ok: false, error: "缺少 endpoint" }, { status: 400 });
    }
    await deletePushSubscription(user.id, endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("移除推播訂閱失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
