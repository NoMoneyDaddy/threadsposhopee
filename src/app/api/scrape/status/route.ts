import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getApifyCredentials } from "@/lib/store";
import { listRecentScrapeRuns } from "@/lib/scrape-runs";
import { advanceOwnerRuns } from "@/services/scraper/async-scrape";
import { getApifyRunLog } from "@/services/scraper/threads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 即時進度（前端輪詢）：先推進本使用者未完成的 run（使用者在看就即時完成入庫），再回最近的 run 列。
// ?runId=&log=1：另回該 run 的 Apify log（純文字，前端即時顯示）。run 須屬於本使用者。
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

    // 看的當下順手推進（與背景 cron 互補；都用原子的 ingesting 標記，重複呼叫安全）。
    await advanceOwnerRuns(user.id).catch(() => {});
    const runs = await listRecentScrapeRuns(user.id, 20);

    const url = new URL(req.url);
    const logRunId = url.searchParams.get("log") ? url.searchParams.get("runId") : null;
    let log: string | undefined;
    if (logRunId) {
      // 越權防護：log 只給屬於本使用者的 run。
      const run = runs.find((r) => r.id === logRunId || r.apify_run_id === logRunId);
      if (run?.apify_run_id) {
        const token = (await getApifyCredentials(user.id))?.token;
        if (token) log = (await getApifyRunLog(run.apify_run_id, token)).slice(-8000); // 取尾段，避免過大
      }
    }
    return NextResponse.json({ ok: true, runs, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
