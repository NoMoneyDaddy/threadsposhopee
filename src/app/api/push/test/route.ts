import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { sendUserPush, isPushConfigured } from "@/lib/push";
import { listPushSubscriptions } from "@/lib/push-store";

export const dynamic = "force-dynamic";

// 發一則測試推播到本人所有已訂閱裝置，確認推播鏈路可達。
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!isPushConfigured()) return NextResponse.json({ ok: false, error: "伺服器未設定推播金鑰" }, { status: 503 });
    const subs = await listPushSubscriptions(user.id);
    if (subs.length === 0) return NextResponse.json({ ok: false, error: "尚未在任何裝置開啟推播" }, { status: 400 });
    await sendUserPush(user.id, "這是一則測試推播，推播設定正常運作。", { title: "IwantPo 測試推播" });
    return NextResponse.json({ ok: true, devices: subs.length });
  } catch (e) {
    log.error("測試推播失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
