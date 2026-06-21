import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron-auth";
import { runCronAll } from "@/services/cron/run-all";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 全自動「總排程」：一條外部 Cron（建議每 15 分）打這支就好。實作見 runCronAll（與內建排程共用）。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  const out = await runCronAll();
  return NextResponse.json({ ok: true, ...out });
}
