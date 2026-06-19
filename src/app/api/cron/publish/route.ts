import { runPublishQueue, type ShardOpts } from "@/services/publish/queue";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 解析分片參數：?shards=N&shard=i（0 ≤ i < N）。供多條 cron 並行發文，各自只處理自己那片帳號。
// 不帶或不合法 → 不分片（單一全域模式）。注意：全域與分片擇一，勿混用以免重複發文。
function parseShard(req: Request): ShardOpts | undefined {
  const sp = new URL(req.url).searchParams;
  const total = Number(sp.get("shards"));
  const index = Number(sp.get("shard"));
  if (!Number.isInteger(total) || total < 2) return undefined;
  if (!Number.isInteger(index) || index < 0 || index >= total) return undefined;
  return { index, total };
}

// 獨立的「發文」排程端點（與爬取 /api/cron 分開）。可選分片並行（見 parseShard）。
export const GET = createCronHandler(
  "發文",
  (req) => runPublishQueue(parseShard(req)),
  (r) =>
    r.failed.length > 0
      ? `⚠️ 發文佇列有 ${r.failed.length} 則失敗：${r.failed.map((f) => f.error).join("; ").slice(0, 300)}`
      : null
);
