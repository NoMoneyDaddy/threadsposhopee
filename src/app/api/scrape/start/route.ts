import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasApifyCredentials } from "@/lib/store";
import { startScrapeRunsForOwner } from "@/services/scraper/async-scrape";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
// 只負責「啟動 run」並立刻回 run 列（不等跑完）；長跑由背景 cron／前端輪詢推進，不受 300s 限制。
export const maxDuration = 60;

// 啟動非同步抓取：跑自己所有啟用來源，各起一個 Apify run。回傳 run 列供前端輪詢進度。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    if (!isDemoMode) {
      const apify = await hasApifyCredentials(user.id);
      if (!apify.bound) return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Apify 金鑰" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const after = typeof body?.after === "string" && DATE_RE.test(body.after) ? body.after : undefined;
    const before = typeof body?.before === "string" && DATE_RE.test(body.before) ? body.before : undefined;
    const runs = await startScrapeRunsForOwner(user.id, { force, after, before });
    return NextResponse.json({ ok: true, runs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
