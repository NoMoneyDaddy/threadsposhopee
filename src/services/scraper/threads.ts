import { isDemoMode } from "@/lib/env";
import sampleThread from "@/fixtures/sample-thread.json";
import { fetchWithRetry } from "@/lib/http";
import type { DraftMedia } from "@/lib/types";

// Threads 搜尋爬蟲 actor（取代舊的帳號時間軸 actor）：可用關鍵字搜尋，或用 from 過濾單一帳號。
const DEFAULT_THREADS_ACTOR = "igview-owner/threads-search-scraper";

export interface ScrapedPost {
  postId: string;
  username: string; // 原貼文作者（subId 追蹤用）
  isReply: boolean;
  text: string;
  // 全部媒體（去重後；影片在前）。供「同一篇」合格素材組（影片＋圖）整組帶入。
  media: DraftMedia[];
  // 主要媒體（media[0]）：向後相容單一媒體欄位。
  mediaType: "image" | "video" | "none";
  mediaUrl: string | null;
  shopeeLinks: string[];
}

// 抓取蝦皮連結：短連結（s.shopee.tw / shope.ee）或完整商品網址（shopee.tw/...）
const SHOPEE_SHORT_RE =
  /(https?:\/\/(?:s\.shopee\.tw|shope\.ee)\/[a-zA-Z0-9]+|https?:\/\/shopee\.tw\/[^\s"'()]+)/g;

// 從貼文網址抽出貼文 id（去重鍵）：https://www.threads.com/@user/post/<code> → <code>
function postIdFromUrl(url: string): string {
  const m = url?.match(/\/post\/([^/?#]+)/);
  return m ? m[1] : "";
}

// 同一媒體常以多種尺寸變體出現（URL 路徑含同一媒體 id，如 /<id>_<...>_n.jpg），
// 取此 id 當去重鍵，避免把同圖/同片重複當成多個媒體。
function mediaId(url: string): string {
  return url.match(/\/(\d{6,})_\d+_\d+_n\./)?.[1] ?? url;
}

// 收集貼文的全部去重媒體（影片在前，便於主要媒體為影片）：
// 同一篇含影片＋圖時，兩者都會被收進來，供合格素材組（1 影片＋≥1 圖）整組使用。
function collectMedia(item: any): DraftMedia[] {
  const out: DraftMedia[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, type: "image" | "video") => {
    if (typeof url !== "string" || !url) return;
    const key = `${type}:${mediaId(url)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ url, type });
  };
  push(item.videoUrl, "video");
  if (Array.isArray(item.allVideos)) for (const u of item.allVideos) push(u, "video");
  push(item.imageUrl, "image");
  if (Array.isArray(item.allImages)) for (const u of item.allImages) push(u, "image");
  return out;
}

// 把 search scraper 的扁平 dataset items 攤平成 ScrapedPost[]：每個 item 即一則貼文。純函式可測。
export function parseSearchPosts(items: any[]): ScrapedPost[] {
  if (!Array.isArray(items)) return [];
  const out: ScrapedPost[] = [];
  for (const item of items) {
    if (!item) continue;
    const text: string = item.captionText ?? "";
    const postId = postIdFromUrl(item.postUrl ?? "");
    if (!postId) continue;
    const media = collectMedia(item);
    out.push({
      postId,
      username: item.username ?? "",
      isReply: Boolean(item.isReply),
      text,
      media,
      mediaType: media[0]?.type ?? "none",
      mediaUrl: media[0]?.url ?? null,
      shopeeLinks: Array.from(text.matchAll(SHOPEE_SHORT_RE)).map((m) => m[1])
    });
  }
  return out;
}

// 搜尋條件：username（→ actor 的 from，監看單一帳號）或 searchQuery（→ 關鍵字搜尋）。
// 傳字串視為 username（沿用舊呼叫方式）。
export interface ScrapeQuery {
  username?: string | null;
  searchQuery?: string | null;
  sort?: "top" | "recent";
}

// actor 的 from 僅允許這組字元（schema：^[a-zA-Z0-9._]*$）。
const THREADS_USERNAME_RE = /^[a-zA-Z0-9._]+$/;

// 把 posts_limit 正規化成正整數（非有限值／≤0 → 預設 20）。request（maxPosts）與 response（slice）共用，
// 避免兩邊 fallback 規則分岐（如 NaN 時 slice 出空陣列）。純函式可測。
export function normalizePostsLimit(postsLimit: number): number {
  const n = Number.isFinite(postsLimit) ? Math.floor(postsLimit) : 20;
  return n > 0 ? n : 20;
}

// 依 Threads Search Scraper 的 input schema 與限制組 actor input（純函式可測）：
// - searchQuery 必填（只監看帳號時預設 "shope"，精準篩含蝦皮連結的貼文）。
// - from 僅允許 ^[a-zA-Z0-9._]*$：去掉開頭 @；若仍含不合法字元就明確報錯（fail fast），
//   不靜默刪字元——否則可能把無效帳號改成「另一個真實帳號」而誤爬。
// - maxPosts 夾 20–200：actor 每次 run 上限約 20 頁 × 每頁約 10 篇 ≈ 200 篇（schema 名目上限 1000，
//   但實際取不到那麼多，夾到 200 避免誤期待並少燒額度）。
// - sort 僅 top / recent（非法值退回 recent）。
export interface ThreadsScraperInput {
  searchQuery: string;
  sort: "top" | "recent";
  maxPosts: number;
  from?: string;
}

export function buildScraperInput(spec: ScrapeQuery, postsLimit: number): ThreadsScraperInput {
  const from = (spec.username ?? "").trim().replace(/^@+/, "");
  if (from && !THREADS_USERNAME_RE.test(from)) {
    throw new Error(`無效的 Threads 帳號名稱「${from}」：僅能包含英數字、底線與點（a-z A-Z 0-9 . _）`);
  }
  const searchQuery = spec.searchQuery?.trim() || "shope";
  const sort: "top" | "recent" = spec.sort === "top" ? "top" : "recent";
  const maxPosts = Math.min(200, Math.max(20, normalizePostsLimit(postsLimit)));
  const input: ThreadsScraperInput = { searchQuery, sort, maxPosts };
  if (from) input.from = from;
  return input;
}

// 呼叫 Apify Threads Search Scraper 取得貼文。Demo 模式直接回 fixture。
// creds：使用者自己綁的 Apify token/actor（一律自綁，不再用全域 env）。
export async function scrapeLatestPosts(
  query: string | ScrapeQuery,
  postsLimit = 20,
  creds?: { token: string; actor?: string | null } | null
): Promise<ScrapedPost[]> {
  // Demo 模式才回假資料；正式環境沒金鑰要報錯，避免靜默吞掉（誤以為有在爬）
  if (isDemoMode) {
    return parseSearchPosts(sampleThread as any[]);
  }
  const token = creds?.token;
  const actor = creds?.actor || DEFAULT_THREADS_ACTOR;
  if (!token) {
    throw new Error("未綁定 Apify token（請到帳號管理綁定你自己的 Apify 金鑰）");
  }

  const spec: ScrapeQuery = typeof query === "string" ? { username: query } : query;
  // input 欄位與限制集中在 buildScraperInput（依 actor schema：searchQuery 必填、from 字元限制、maxPosts 上限約 200）。
  // safePostsLimit 與 buildScraperInput 共用同一正規化，request 與 response（slice）的 NaN/0 fallback 一致。
  const safePostsLimit = normalizePostsLimit(postsLimit);
  const body = buildScraperInput(spec, safePostsLimit);

  // run-sync 端點注意事項（docs.apify.com/api/v2/act-run-sync-get-dataset-items-post）：
  // - timeout：綁定本次 run 上限秒數（端點硬上限 300s，逾時回 408）；本爬蟲 maxPosts≤200 通常數秒，設 60s 防卡住燒額度。
  // - maxItems：限制計費／回傳筆數，與 input 的 maxPosts 對齊當雙重保險。
  const RUN_TIMEOUT_SEC = 60;
  const params = new URLSearchParams({
    token,
    timeout: String(RUN_TIMEOUT_SEC),
    maxItems: String(body.maxPosts)
  });
  const url = `https://api.apify.com/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?${params.toString()}`;
  // 只對 429（rate limited、run 尚未啟動）退避重試；408（run 逾時）與 4xx/5xx 皆為終態，
  // 不重試以免重複觸發爬蟲 run 重複計費。client 逾時略大於 run timeout，讓伺服器端先回 408/結果。
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    (RUN_TIMEOUT_SEC + 5) * 1000
  );
  if (!res.ok) throw new Error(`Apify 失敗: ${res.status} ${await res.text()}`);
  const dataset = await res.json();
  // Apify 回傳是 dataset items 陣列（每筆即一則貼文）。actor 的 maxPosts 下限 20，
  // 但使用者的 posts_limit 可能更小 → 解析後再夾到設定值，避免處理過多、燒 AI/Shopee 額度。
  const posts = parseSearchPosts(Array.isArray(dataset) ? dataset : [dataset]);
  return posts.slice(0, safePostsLimit);
}
