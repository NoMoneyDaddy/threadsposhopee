import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron 會以 GET 呼叫，並帶 Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  try {
    const results = await runAllSources();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendAlert(`❌ 爬取 cron 失敗：${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
