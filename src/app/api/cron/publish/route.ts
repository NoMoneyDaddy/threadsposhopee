import { NextResponse } from "next/server";
import { runPublishQueue } from "@/services/publish/queue";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 獨立的「發文」排程端點（與爬取 /api/cron 分開）。
// Zeabur / Vercel Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" && !env.cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 未設定（生產環境必填）" }, { status: 500 });
  }
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await runPublishQueue();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
}
