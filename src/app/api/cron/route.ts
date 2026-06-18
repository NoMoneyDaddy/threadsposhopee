import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron 會以 GET 呼叫，並帶 Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const results = await runAllSources();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
