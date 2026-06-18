import { NextResponse } from "next/server";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { assertCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 每日展期即將到期的 Threads 長期 token（與爬取／發文分開的獨立排程）。
// Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  const result = await refreshExpiringTokens();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
}
