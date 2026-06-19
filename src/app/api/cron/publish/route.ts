import { runPublishQueue } from "@/services/publish/queue";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 獨立的「發文」排程端點（與爬取 /api/cron 分開）。
export const GET = createCronHandler(
  "發文",
  () => runPublishQueue(),
  (r) =>
    r.failed.length > 0
      ? `⚠️ 發文佇列有 ${r.failed.length} 則失敗：${r.failed.map((f) => f.error).join("; ").slice(0, 300)}`
      : null
);
