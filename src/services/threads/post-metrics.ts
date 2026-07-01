// 發文成效回填 worker（cron）：分批抓已發布貼文的 Threads 互動（views/likes）寫入 post_metrics，
// 供共享庫/選品雷達排序的「全站實際成效」加權。受 Threads insights API 額度限制，故每輪只抓少量、
// 只回填 30 天內、最久沒更新的貼文（近似即可，非即時精準）。
import { listPublishedPostsNeedingMetrics, upsertPostMetric, getThreadsCredentials } from "@/lib/store";
import { getPostInsights } from "@/services/threads/insights";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

const REFRESH_STALE_MS = 24 * 60 * 60 * 1000; // 24h 內抓過就不重抓
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 只追蹤發布 30 天內的貼文
const BATCH = 40; // 每輪上限（避免吃爆 insights 額度）

export async function refreshPostMetrics(now = Date.now()): Promise<{ checked: number; updated: number }> {
  if (isDemoMode) return { checked: 0, updated: 0 };
  const staleIso = new Date(now - REFRESH_STALE_MS).toISOString();
  const sinceIso = new Date(now - WINDOW_MS).toISOString();
  const rows = await listPublishedPostsNeedingMetrics(BATCH, staleIso, sinceIso).catch((e) => {
    log.warn("列出待回填成效貼文失敗", { err: e instanceof Error ? e.message : String(e) });
    return [];
  });
  let updated = 0;
  // 同帳號 token 本輪快取一次（多篇同帳號時省查詢）。
  const tokenCache = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.threads_account_id || !r.owner_id) continue;
    if (!tokenCache.has(r.threads_account_id)) {
      const cred = await getThreadsCredentials(r.threads_account_id, r.owner_id).catch(() => null);
      tokenCache.set(r.threads_account_id, cred?.accessToken ?? null);
    }
    const token = tokenCache.get(r.threads_account_id);
    if (!token) continue;
    const ins = await getPostInsights(r.published_post_id, token);
    if (!ins) continue; // 抓不到（額度/權限/貼文已刪）→ 略過，下輪再試
    await upsertPostMetric({
      draftId: r.draft_id,
      ownerId: r.owner_id,
      shopId: r.shop_id,
      itemId: r.item_id,
      views: ins.views,
      likes: ins.likes
    }).catch((e) => log.warn("寫入發文成效失敗", { draftId: r.draft_id, err: e instanceof Error ? e.message : String(e) }));
    updated++;
  }
  return { checked: rows.length, updated };
}
