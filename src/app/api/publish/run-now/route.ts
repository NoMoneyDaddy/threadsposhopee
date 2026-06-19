import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runPublishQueue } from "@/services/publish/queue";
import { setHeartbeat } from "@/lib/store";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 手動「立即跑一輪發文佇列」（等同馬上觸發一次 cron 的發文步驟）。
// owner 限定：佇列是跨租戶處理，且仍受每帳號防封節奏限制。
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!isDemoMode && !user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!isDemoMode && !user?.isOwner) {
      return NextResponse.json({ ok: false, error: "只有管理者可手動觸發發文佇列" }, { status: 403 });
    }
    const result = await runPublishQueue();
    await setHeartbeat().catch(() => {});
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("手動跑佇列失敗", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
