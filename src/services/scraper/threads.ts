import { isDemoMode } from "@/lib/env";
import sampleThread from "@/fixtures/sample-thread.json";
import { fetchWithRetry } from "@/lib/http";

// Threads 搜尋爬蟲 actor（取代舊的帳號時間軸 actor）：可用關鍵字搜尋，或用 from 過濾單一帳號。
const DEFAULT_THREADS_ACTOR = "igview-owner/threads-search-scraper";

export interface ScrapedPost {
  postId: string;
  username: string; // 原貼文作者（subId 追蹤用）
  isReply: boolean;
  text: string;
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

// 取貼文的「主要媒體」：優先影片，否則第一張圖。
// 注意：allImages/allVideos 多是「同一檔的多種尺寸變體」（URL 路徑含同一媒體 id），
// 不是多個不同媒體；故只取代表（cover）一個，避免把同圖重複當輪播。
function pickMedia(item: any): { type: "image" | "video"; url: string } | null {
  const video = item.videoUrl || (Array.isArray(item.allVideos) ? item.allVideos[0] : null);
  if (typeof video === "string" && video) return { type: "video", url: video };
  const image = item.imageUrl || (Array.isArray(item.allImages) ? item.allImages[0] : null);
  if (typeof image === "string" && image) return { type: "image", url: image };
  return null;
}

// 把 search scraper 的扁平 dataset items 攤平成 ScrapedPost[]：每個 item 即一則貼文。
// 媒體取主要一個（影片優先，否則 cover 圖）。純函式可測。
export function parseSearchPosts(items: any[]): ScrapedPost[] {
  if (!Array.isArray(items)) return [];
  const out: ScrapedPost[] = [];
  for (const item of items) {
    if (!item) continue;
    const text: string = item.captionText ?? "";
    const postId = postIdFromUrl(item.postUrl ?? "");
    if (!postId) continue;
    const media = pickMedia(item);
    out.push({
      postId,
      username: item.username ?? "",
      isReply: Boolean(item.isReply),
      text,
      mediaType: media?.type ?? "none",
      mediaUrl: media?.url ?? null,
      shopeeLinks: Array.from(text.matchAll(SHOPEE_SHORT_RE)).map((m) => m[1])
    });
  }
  return attachMainMedia(out);
}

// 相鄰配對（標準兩段式模板）：發文者常把吸睛影片/圖放主文、蝦皮連結放 2/2 留言。
// 對「帶連結但自身無媒體」的貼文，往前找同作者、最近一篇「有媒體的主文」借用其媒體，
// 湊成「媒體＋商品連結」的合格素材組。就地修改並回傳同一陣列。
function attachMainMedia(posts: ScrapedPost[]): ScrapedPost[] {
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    if (p.mediaType !== "none" || p.shopeeLinks.length === 0) continue;
    for (let j = i - 1; j >= 0; j--) {
      const c = posts[j];
      if (c.username && c.username === p.username && !c.isReply && c.mediaType !== "none") {
        p.mediaType = c.mediaType;
        p.mediaUrl = c.mediaUrl;
        break;
      }
    }
  }
  return posts;
}

// 搜尋條件：username（→ actor 的 from，監看單一帳號）或 searchQuery（→ 關鍵字搜尋）。
// 傳字串視為 username（沿用舊呼叫方式）。
export interface ScrapeQuery {
  username?: string | null;
  searchQuery?: string | null;
  sort?: "top" | "recent";
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
  const username = spec.username?.trim().replace(/^@/, "") || "";
  // actor 的 searchQuery 為必填，空字串可能觸發 Apify 驗證錯誤。本專案目標貼文必含蝦皮連結
  // （s.shopee.tw／shope.ee／shopee.tw 皆含子字串 "shope"），故只監看帳號時預設帶 "shope"，
  // 既滿足必填又精準篩出含分潤連結的貼文。
  const searchQuery = spec.searchQuery?.trim() || "shope";
  const body: Record<string, unknown> = {
    searchQuery,
    sort: spec.sort ?? "recent",
    // maxPosts 下限 20、上限 1000；pipeline 的 posts_limit 常為個位數，故夾到合法範圍。
    maxPosts: Math.min(1000, Math.max(20, postsLimit))
  };
  if (username) body.from = username;

  const url = `https://api.apify.com/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?token=${token}`;
  // 只對 429（rate limited、run 尚未啟動）退避重試，避免 5xx 後重試重複觸發爬蟲 run；
  // run-sync 會等爬蟲跑完，放寬逾時 45s。
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    45000
  );
  if (!res.ok) throw new Error(`Apify 失敗: ${res.status} ${await res.text()}`);
  const dataset = await res.json();
  // Apify 回傳是 dataset items 陣列（每筆即一則貼文）。actor 的 maxPosts 下限 20，
  // 但使用者的 posts_limit 可能更小 → 解析後再夾到設定值，避免處理過多、燒 AI/Shopee 額度。
  const posts = parseSearchPosts(Array.isArray(dataset) ? dataset : [dataset]);
  return posts.slice(0, Math.max(1, postsLimit));
}
