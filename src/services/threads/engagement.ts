// 彙整最近貼文的 Threads 互動數據：逐帳號 token 查每篇 insights，加總並依觀看數排序。
import { listRecentPublishedPosts, listThreadsAccountTokens, getCachedJson, setCachedJson } from "@/lib/store";
import { getPostInsights, type PostInsights } from "./insights";
import { detectReachDrop } from "./reach";

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

// 扣除「本人補發的 2/n 分潤留言」：reply_status==='published' 才代表該則已實際發到主貼文，
// Threads 的 replies 會把它算進去 → 減 1（floor 0）。多段串文中只有 2/n 直接回主貼文（3/n+ 接續在前一段下），
// 故主貼文 replies 固定只含 1 則本人留言，扣 1 即可。純函式可測。
export function ownReplyAdjustedReplies(rawReplies: number, replyStatus: string | null | undefined): number {
  if (replyStatus !== "published") return rawReplies;
  return Math.max(0, rawReplies - 1);
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

// 成效頁「抓不到任何互動數據」時要顯示哪種提示。純函式可測。
// - 有已發布貼文(sampled>0)卻完全抓不到數據(fetched===0) 才提示；否則 null（正常的樣本不足）。
// - insights 範圍「目前有請求」→ 提示重新授權即可拿到；「被 THREADS_SCOPES 關閉」→ 重新授權也沒用，
//   改提示需先在部署環境啟用 insights 範圍。
export type InsightsHint = "reauth" | "enable_scope" | null;
export function insightsHintKind(
  e: { sampled: number; fetched: number } | null | undefined,
  insightsScopeEnabled: boolean
): InsightsHint {
  if (!e || e.sampled <= 0 || e.fetched > 0) return null;
  return insightsScopeEnabled ? "reauth" : "enable_scope";
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
      // 扣除本人補的 2/n 分潤留言（見 ownReplyAdjustedReplies）。
      return { id: p.id, productName: p.product_name, publishedAt: p.published_at, ...ins, replies: ownReplyAdjustedReplies(ins.replies, p.reply_status) };
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

// 取該使用者「最佳發文時段」整點（依平均觀看由高到低排序）；成效樣本不足回 []，
// 呼叫端據此退回預設 PUBLISH_SLOTS。共用於單篇重發與批次回收的「最佳時段」排程。
export async function getBestHours(ownerId: string, minSamples = 3): Promise<number[]> {
  const eng = await getEngagementCached(ownerId).catch(() => null);
  if (!eng || eng.fetched < minSamples) return [];
  return bestPostingTimes(eng.posts).byHour.map((b) => b.key);
}

// 快取「是否觸及驟降」布林（含 false／無資料），短 TTL。
// getEngagementCached 刻意不快取空結果（fetched=0），若直接在發文佇列每輪呼叫，
// 「無 insights 資料」的 owner 會每輪重打 insights API（額度／DB 浪費，且結果恆為 false）。
// 故另存一顆布林快取（含負向結果），讓發文熱路徑大多只讀便宜的布林、不重抓逐篇 insights。
export async function getReachDropCached(ownerId: string, maxAgeMs = 30 * 60_000): Promise<boolean> {
  if (!ownerId) return false;
  const key = `reachdrop:${ownerId}`;
  const cached = await getCachedJson<{ v: boolean }>(key, maxAgeMs).catch(() => null);
  if (cached) return Boolean(cached.v);
  const eng = await getEngagementCached(ownerId).catch(() => null);
  const v = eng ? detectReachDrop(eng.posts).hasSignal : false;
  await setCachedJson(key, { v }).catch(() => {});
  return v;
}
