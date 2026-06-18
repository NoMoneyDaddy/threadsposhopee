import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron 會以 GET 呼叫，並帶 Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  // 生產環境必須設定 CRON_SECRET，否則此端點完全公開，會被惡意觸發消耗 API 額度
  if (process.env.NODE_ENV === "production" && !env.cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 未設定（生產環境必填）" }, { status: 500 });
  }
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const results = await runAllSources();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
}
