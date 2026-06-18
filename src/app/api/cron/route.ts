import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";
import { assertCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron 會以 GET 呼叫，並帶 Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  const results = await runAllSources();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
