import { NextResponse } from "next/server";
import { runSourcesForOwner } from "@/services/pipeline/run";
import { getCurrentUser } from "@/lib/auth";
import { hasApifyCredentials } from "@/lib/store";
import { isDemoMode } from "@/lib/env";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// 單次 Apify run-sync 抓取在大量（maxPosts 上看 1000）時可逼近端點 300s 硬上限，故路由上限放到 300s，
// 否則大量抓取會在 60s 被砍、回傳不到結果。
export const maxDuration = 300;

// 手動觸發抓取：跑自己的來源、用自己的 Apify 金鑰。
// body.force=true：忽略「已抓過」去重與「已有有效素材」，強制重抓（改設定/換 actor 後重抓免清帳本）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const rl = await rateLimit("pipeline_run", user.id, 10, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    // 批次逐月：本次抓取的日期區間覆寫（YYYY-MM-DD；格式不符忽略）。只有舊版 igview actor 會吃日期。
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const after = typeof body?.after === "string" && DATE_RE.test(body.after) ? body.after : undefined;
    const before = typeof body?.before === "string" && DATE_RE.test(body.before) ? body.before : undefined;
    // demo 模式（無金鑰）：爬蟲走 fixtures、不需 Apify token，故略過綁定檢查讓按鈕可試用。
    if (!isDemoMode) {
      // 不吞 I/O 錯：失敗落外層 catch 回 500，不誤判成「未綁定」。
      const apify = await hasApifyCredentials(user.id);
      if (!apify.bound) {
        return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Apify 金鑰" }, { status: 403 });
      }
    }

    // 時間預算守 maxDuration(300s)：來源多時逐來源中途停手，剩餘下次再跑（留 10s 緩衝給回應序列化）。
    const results = await runSourcesForOwner(user.id, { deadline: Date.now() + 290000, force, after, before });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
