import { runAllSources } from "@/services/pipeline/run";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 爬取／產草稿排程。Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
// 來源 per-source 容錯（不拋），故用 alertWhen 偵測失敗來源並告警（與 cron/all 一致）。
export const GET = createCronHandler(
  "爬取",
  async () => ({ results: await runAllSources() }),
  (r) => {
    const failed = r.results.filter((x) => x.error);
    return failed.length ? `🕷️ 爬取 ${failed.length} 個來源失敗：${failed.map((x) => x.sourceUsername).join("、")}` : null;
  }
);
