import { NextResponse } from "next/server";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 每日展期即將到期的 Threads 長期 token（與爬取／發文分開的獨立排程）。
// Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  try {
    const result = await refreshExpiringTokens();
    if (result.failed > 0) {
      await sendAlert(`⚠️ Token 展期 ${result.failed} 個失敗，相關帳號已標記 error，請重新連結。`);
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendAlert(`❌ Token 展期 cron 失敗：${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
