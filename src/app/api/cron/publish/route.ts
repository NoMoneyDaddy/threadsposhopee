import { NextResponse } from "next/server";
import { runPublishQueue } from "@/services/publish/queue";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 獨立的「發文」排程端點（與爬取 /api/cron 分開）。
// Zeabur / Vercel Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  try {
    const result = await runPublishQueue();
    // 有失敗的發文也告警（讓運維看得到）
    if (result.failed.length > 0) {
      await sendAlert(`⚠️ 發文佇列有 ${result.failed.length} 則失敗：${result.failed.map((f) => f.error).join("; ").slice(0, 300)}`);
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendAlert(`❌ 發文 cron 失敗：${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
