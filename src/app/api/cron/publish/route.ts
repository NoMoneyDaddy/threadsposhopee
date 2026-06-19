import { runPublishQueue, type ShardOpts } from "@/services/publish/queue";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 解析分片參數：?shards=N&shard=i（0 ≤ i < N）。供多條 cron 並行發文，各自只處理自己那片帳號。
// 兩個都沒帶 → 全域模式。帶了但不合法 → 直接拋錯（fail-fast，由 cron 外殼回 500），
// 不可靜默降級成全域，否則設錯的分片 cron 會跑全量造成重複發文。
function parseShard(req: Request): ShardOpts | undefined {
  const sp = new URL(req.url).searchParams;
  const shardsRaw = sp.get("shards");
  const shardRaw = sp.get("shard");
  if (shardsRaw === null && shardRaw === null) return undefined; // 全域模式
  if (shardsRaw === null || shardRaw === null) throw new Error("shards 與 shard 必須同時提供");
  const total = Number(shardsRaw);
  const index = Number(shardRaw);
  if (!Number.isInteger(total) || total < 2) throw new Error("shards 必須是 ≥2 的整數");
  if (!Number.isInteger(index) || index < 0 || index >= total) throw new Error("shard 必須落在 0..shards-1");
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
