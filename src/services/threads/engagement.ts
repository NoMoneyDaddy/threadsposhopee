// 彙整最近貼文的 Threads 互動數據：逐帳號 token 查每篇 insights，加總並依觀看數排序。
import { listRecentPublishedPosts, listThreadsAccountTokens, getCachedJson, setCachedJson } from "@/lib/store";
import { getPostInsights, type PostInsights } from "./insights";

export interface PostEngagement extends PostInsights {
  id: string;
  productName: string | null;
  publishedAt: string | null;
}

export interface EngagementSummary {
  posts: PostEngagement[]; // 成功抓到數據者，依 views 由高到低
  totals: PostInsights;
  sampled: number; // 取樣的已發布貼文數
  fetched: number; // 實際抓到數據的數量
}

// 最佳發文時段：用已抓到的貼文 views，依 Asia/Taipei 時段/星期分桶，算每桶平均觀看。
// 樣本少（取樣上限 15）→ 僅供方向參考，呼叫端應一併顯示樣本數。
export interface TimeBucket {
  key: number;
  label: string;
  avgViews: number;
  posts: number;
}
export interface BestTimes {
  byHour: TimeBucket[];
  byWeekday: TimeBucket[];
}

const WEEKDAY_LABEL = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const tpeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", hour: "2-digit", hour12: false, weekday: "short" });

function tpeParts(iso: string): { hour: number; weekday: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let hour = 0;
  let weekday = -1;
  for (const p of tpeFmt.formatToParts(d)) {
    if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
    else if (p.type === "weekday") weekday = WEEKDAY_INDEX[p.value] ?? -1;
  }
  if (weekday < 0 || Number.isNaN(hour)) return null;
  return { hour, weekday };
}

export function bestPostingTimes(posts: { publishedAt: string | null; views: number }[]): BestTimes {
  const hour = new Map<number, { sum: number; n: number }>();
  const wday = new Map<number, { sum: number; n: number }>();
  for (const p of posts) {
    if (!p.publishedAt) continue;
    const t = tpeParts(p.publishedAt);
    if (!t) continue;
    const addH = hour.get(t.hour) ?? { sum: 0, n: 0 };
    hour.set(t.hour, { sum: addH.sum + p.views, n: addH.n + 1 });
    const addW = wday.get(t.weekday) ?? { sum: 0, n: 0 };
    wday.set(t.weekday, { sum: addW.sum + p.views, n: addW.n + 1 });
  }
  const toBuckets = (m: Map<number, { sum: number; n: number }>, label: (k: number) => string): TimeBucket[] =>
    [...m.entries()]
      .map(([key, v]) => ({ key, label: label(key), avgViews: Math.round(v.sum / v.n), posts: v.n }))
      .sort((a, b) => b.avgViews - a.avgViews);
  return {
    byHour: toBuckets(hour, (h) => `${String(h).padStart(2, "0")}:00`),
    byWeekday: toBuckets(wday, (w) => WEEKDAY_LABEL[w])
  };
}

export async function getEngagement(ownerId: string, limit = 15): Promise<EngagementSummary> {
  const [posts, tokens] = await Promise.all([
    listRecentPublishedPosts(ownerId, limit),
    listThreadsAccountTokens(ownerId)
  ]);
  const tokenMap = new Map(tokens.map((t) => [t.id, t.accessToken]));

  const results = await Promise.all(
    posts.map(async (p): Promise<PostEngagement | null> => {
      const token = p.threads_account_id ? tokenMap.get(p.threads_account_id) : undefined;
      if (!token) return null;
      const ins = await getPostInsights(p.published_post_id, token);
      if (!ins) return null;
      return { id: p.id, productName: p.product_name, publishedAt: p.published_at, ...ins };
    })
  );
  const got = results.filter((x): x is PostEngagement => x !== null);

  const totals = got.reduce<PostInsights>(
    (a, p) => ({
      views: a.views + p.views,
      likes: a.likes + p.likes,
      replies: a.replies + p.replies,
      reposts: a.reposts + p.reposts,
      quotes: a.quotes + p.quotes,
      shares: a.shares + p.shares
    }),
    { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 }
  );
  got.sort((a, b) => b.views - a.views);

  return { posts: got, totals, sampled: posts.length, fetched: got.length };
}

// 快取版（成效頁用）：Threads insights 逐篇打 API（受 200 calls/hr 限制），
// 重載頁面易燒額度 → app_state 快取一段時間。只快取「有抓到資料」的結果，
// 避免把暫時性失敗的空結果鎖住整個 TTL。
export async function getEngagementCached(
  ownerId: string,
  limit = 15,
  maxAgeMs = 30 * 60_000
): Promise<EngagementSummary> {
  const key = `engagement:${ownerId}:limit:${limit}`;
  const cached = await getCachedJson<EngagementSummary>(key, maxAgeMs).catch(() => null);
  if (cached) return cached;
  const fresh = await getEngagement(ownerId, limit);
  if (fresh.fetched > 0) await setCachedJson(key, fresh).catch(() => {});
  return fresh;
}
