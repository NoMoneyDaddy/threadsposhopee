import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runPublishQueue } from "@/services/publish/queue";
import { setHeartbeat } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 手動「立即跑一輪發文佇列」（等同馬上觸發一次 cron 的發文步驟）。
// owner 限定：佇列是跨租戶處理，且仍受每帳號防封節奏限制。
export async function POST() {
  try {
    // getCurrentUser 在 demo 模式會回傳 isOwner=true 的模擬使用者，故毋須再判 demo
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) {
      return NextResponse.json({ ok: false, error: "只有管理者可手動觸發發文佇列" }, { status: 403 });
    }
    const result = await runPublishQueue();
    // 沒搶到鎖（另一輪正在跑）不更新心跳，避免誤判已執行
    if (!result.lockBusy) await setHeartbeat().catch(() => {});
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("手動跑佇列失敗", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
