import { isDemoMode } from "@/lib/env";
import sampleThread from "@/fixtures/sample-thread.json";
import { fetchWithRetry } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import type { DraftMedia } from "@/lib/types";

// Threads 搜尋爬蟲 actor。預設用 automation-lab/threads-scraper（搜尋＋帳號貼文，且會回傳影片 URL 與
// 完整輪播媒體）；舊的 igview-owner/threads-search-scraper 仍相容（輸入/輸出 schema 不同，下方分流處理）。
const DEFAULT_THREADS_ACTOR = "automation-lab/threads-scraper";
// 舊版 igview 搜尋 actor：輸入欄位（searchQuery/from/sort）與輸出欄位（captionText/imageUrl/allImages）
// 都與新 actor 不同，需特別分流。
const LEGACY_SEARCH_ACTOR = "igview-owner/threads-search-scraper";

// Apify actor 識別碼格式：username/actor-name、username~actor-name 或 17 碼 actorId。
// 僅允許英數與 . _ - 及單一 / 或 ~ 分隔；擋掉 ? # & 等可改寫 api.apify.com path/query 的字元。純函式可測。
export function isValidApifyActor(actor: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*(?:[/~][a-zA-Z0-9._-]+)?$/.test(actor);
}

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

// 抓取蝦皮連結：短連結（s.shopee.tw / shope.ee / shp.ee）或完整商品網址（含 www./m. 子網域）。
// 短碼字元：除英數外也含 - 與 _（部分分潤短碼帶這兩個字元，舊規則 [a-zA-Z0-9]+ 會在此處截斷成壞連結）。
const SHOPEE_SHORT_RE =
  /(https?:\/\/(?:s\.shopee\.tw|shope\.ee|shp\.ee)\/[a-zA-Z0-9_-]+|https?:\/\/(?:www\.|m\.)?shopee\.tw\/[^\s"'()]+)/g;
// 完整網址分支的 [^\s"'()]+ 會把句尾的全形／半形標點一起吃進去（如「…/product/1/2，」），
// 抽出後先修剪尾端標點再回傳，避免產生壞連結。
// （限制：標點後「緊接」中文且無空白時無法可靠切分——蝦皮 slug 本身含中文，排除中文會誤傷合法連結。）
const TRAILING_PUNCTUATION_RE = /[，。！？；：、,.!?;:]+$/u;

// 從一段文字抽出所有蝦皮連結（去重，保序）。純函式可測。
// text 來自外部爬蟲 dataset（parseSearchPosts 吃 any[]），非字串視同無連結（回 []，不拋）。
export function extractShopeeLinks(text: string): string[] {
  if (typeof text !== "string" || !text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(SHOPEE_SHORT_RE)) {
    const link = m[1].replace(TRAILING_PUNCTUATION_RE, "");
    if (!link || seen.has(link)) continue;
    seen.add(link);
    out.push(link);
  }
  return out;
}

// 從貼文網址抽出貼文 id（去重鍵）：相容兩種格式
// 舊 actor：https://www.threads.com/@user/post/<code>；新 actor：https://www.threads.com/t/<code>
function postIdFromUrl(url: string): string {
  const m = url?.match(/\/(?:post|t)\/([^/?#]+)/);
  return m ? m[1] : "";
}

// 同一媒體常以多種尺寸變體出現（URL 路徑含同一媒體 id，如 /<id>_<...>_n.jpg），
// 取此 id 當去重鍵，避免把同圖/同片重複當成多個媒體。
function mediaId(url: string): string {
  return url.match(/\/(\d{6,})_\d+_\d+_n\./)?.[1] ?? url;
}

// 收集貼文的全部去重媒體（同圖多尺寸去重）：同一篇含影片＋圖時兩者都收進來，
// 供合格素材組（1 影片＋≥1 圖）整組使用。相容兩種 actor 輸出格式：
// - 新 actor（automation-lab）：item.media 為物件陣列 [{type:"video", url:封面, videoUrl:mp4}, {type:"photo", url}]；
//   影片要取可播放的 videoUrl（url 只是封面圖），輪播每項是不同媒體。
// - 舊 actor（igview）：扁平欄位 imageUrl/allImages/videoUrl/allVideos（allImages 多為同圖不同尺寸）。
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
  // 新 actor：media[] 物件陣列
  if (Array.isArray(item.media) && item.media.some((m: any) => m && typeof m === "object")) {
    for (const m of item.media) {
      if (!m || typeof m !== "object") continue;
      if (m.type === "video") {
        if (typeof m.videoUrl === "string" && m.videoUrl) push(m.videoUrl, "video");
        else push(m.url, "image"); // 無 videoUrl 時退回封面圖，不漏掉這格
      } else {
        push(m.url, "image"); // photo（或其他）
      }
    }
    return out;
  }
  // 舊 actor：扁平欄位
  push(item.videoUrl, "video");
  if (Array.isArray(item.allVideos)) for (const u of item.allVideos) push(u, "video");
  push(item.imageUrl, "image");
  if (Array.isArray(item.allImages)) for (const u of item.allImages) push(u, "image");
  return out;
}

// 把 search scraper 的扁平 dataset items 攤平成 ScrapedPost[]：每個 item 即一則貼文。純函式可測。
// 配對主文媒體：常見的「2/2 分潤貼文」版型是——主貼文放圖／影片（無蝦皮連結），其下方的 2/2 留言
// 才放蝦皮連結（本身無媒體）。pipeline 取的是「帶連結」的留言，若不配對就會做出沒有圖的素材。
// 故對「isReply＋有蝦皮連結＋自身無媒體」的貼文，沿用同作者「前一則有媒體貼文」的媒體（dataset 中
// 主文排在其 2/2 留言之前），讓素材帶到母貼文的圖。純函式可測。
export function parseSearchPosts(items: any[]): ScrapedPost[] {
  if (!Array.isArray(items)) return [];
  const out: ScrapedPost[] = [];
  const lastMediaByUser = new Map<string, DraftMedia[]>(); // 作者 → 最近一則有媒體貼文的媒體
  for (const item of items) {
    if (!item) continue;
    // 新 actor 會混入 type:"profile" 的項目（帳號資訊，非貼文）→ 跳過；舊 actor 無 type 欄位，照舊處理。
    if (item.type && item.type !== "post") continue;
    const text: string = item.text ?? item.captionText ?? "";
    // 新 actor 用 code；舊 actor 從 postUrl 取。
    const postId = item.code || postIdFromUrl(item.postUrl ?? item.url ?? "");
    if (!postId) continue;
    const username: string = item.username ?? "";
    const isReply = Boolean(item.isReply);
    const shopeeLinks = extractShopeeLinks(text);
    let media = collectMedia(item);
    if (media.length > 0 && username) {
      lastMediaByUser.set(username, media);
    } else if (media.length === 0 && isReply && shopeeLinks.length > 0 && username) {
      // 帶連結但無媒體的 2/2 留言：沿用同作者母貼文（前一則有媒體者）的媒體。
      media = lastMediaByUser.get(username) ?? [];
    }
    out.push({
      postId,
      username,
      isReply,
      text,
      media,
      mediaType: media[0]?.type ?? "none",
      mediaUrl: media[0]?.url ?? null,
      shopeeLinks
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
  after?: string | null; // YYYY-MM-DD（含）；空＝不限
  before?: string | null; // YYYY-MM-DD（含）；空＝不限
}

// actor 的 from 僅允許這組字元（schema：^[a-zA-Z0-9._]*$）。
const THREADS_USERNAME_RE = /^[a-zA-Z0-9._]+$/;
// actor 的 after／before 為 YYYY-MM-DD。非法格式直接忽略（不阻斷抓取；UI 端已先驗證並擋下）。
const THREADS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 把 posts_limit 正規化成正整數（非有限值／≤0 → 預設 20）。request（maxPosts）與 response（slice）共用，
// 避免兩邊 fallback 規則分岐（如 NaN 時 slice 出空陣列）。純函式可測。
export function normalizePostsLimit(postsLimit: number): number {
  const n = Number.isFinite(postsLimit) ? Math.floor(postsLimit) : 20;
  return n > 0 ? n : 20;
}

// 兩種 actor 的 input schema 不同：
// - 新 actor（automation-lab）：{ mode:"posts"|"search", usernames|searchQueries, maxPosts(1–200) }。
// - 舊 actor（igview）：{ searchQuery, sort, maxPosts(20–1000), from?, after?, before? }。
export type ThreadsScraperInput =
  | { mode: "posts"; usernames: string[]; maxPosts: number }
  | { mode: "search"; searchQueries: string[]; maxPosts: number }
  | { searchQuery: string; sort: "top" | "recent"; maxPosts: number; from?: string; after?: string; before?: string };

// 依綁定的 actor 組 input（純函式可測）。from 一律先去單一前導 @ 並驗格式（fail fast，不靜默改字元，
// 否則可能把無效帳號改成「另一個真實帳號」而誤爬）。
export function buildScraperInput(spec: ScrapeQuery, postsLimit: number, actor: string = DEFAULT_THREADS_ACTOR): ThreadsScraperInput {
  const from = (spec.username ?? "").trim().replace(/^@/, "");
  if (from && !THREADS_USERNAME_RE.test(from)) {
    throw new Error(`無效的 Threads 帳號名稱「${from}」：僅能包含英數字、底線與點（a-z A-Z 0-9 . _）`);
  }

  if (actor === LEGACY_SEARCH_ACTOR) {
    // 舊 igview 搜尋 actor：searchQuery 必填（只監看帳號時預設 "shope" 精準篩含蝦皮連結的貼文）；
    // maxPosts 夾 20–1000（actor schema 範圍，下限 20 為 actor 要求）；sort 僅 top/recent。
    const searchQuery = spec.searchQuery?.trim() || "shope";
    const sort: "top" | "recent" = spec.sort === "top" ? "top" : "recent";
    const maxPosts = Math.min(1000, Math.max(20, normalizePostsLimit(postsLimit)));
    const input: ThreadsScraperInput = { searchQuery, sort, maxPosts };
    const after = (spec.after ?? "").trim();
    const before = (spec.before ?? "").trim();
    if (from) input.from = from;
    if (THREADS_DATE_RE.test(after)) input.after = after;
    if (THREADS_DATE_RE.test(before)) input.before = before;
    return input;
  }

  // 新 actor（automation-lab/threads-scraper）：maxPosts 1–200。有指定帳號 → mode:posts 抓該帳號貼文；
  // 否則 mode:search 用關鍵字（預設 "shope"）。註：此 actor 無「帳號內關鍵字搜尋」與排序/日期區間，
  // 兩者皆設時以帳號（posts）為主。
  const maxPosts = Math.min(200, Math.max(1, normalizePostsLimit(postsLimit)));
  if (from) return { mode: "posts", usernames: [from], maxPosts };
  return { mode: "search", searchQueries: [spec.searchQuery?.trim() || "shope"], maxPosts };
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
  // actor 可由使用者自綁，先驗證格式擋掉可改寫 path/query 的字元（再配合 assertSafePublicUrl 出站守衛）。
  if (!isValidApifyActor(actor)) {
    throw new Error(`無效的 Apify actor 識別碼「${actor}」`);
  }

  const spec: ScrapeQuery = typeof query === "string" ? { username: query } : query;
  // input 欄位與限制集中在 buildScraperInput（依 actor schema：searchQuery 必填、from 字元限制、maxPosts 上限約 200）。
  // safePostsLimit 與 buildScraperInput 共用同一正規化，request 與 response（slice）的 NaN/0 fallback 一致。
  const safePostsLimit = normalizePostsLimit(postsLimit);
  const body = buildScraperInput(spec, safePostsLimit, actor);

  // run-sync 端點注意事項（docs.apify.com/api/v2/act-run-sync-get-dataset-items-post）：
  // - timeout：綁定本次 run 上限秒數（端點硬上限 300s，逾時回 408）。隨 maxPosts 放大（每頁約 10 篇，
  //   抓越多需越久）：小量維持 60s 快回、避免卡住燒額度；大量（如 1000 篇）給到接近 300s 端點上限。
  // - maxItems：限制計費／回傳筆數，與 input 的 maxPosts 對齊當雙重保險。
  // 逾時地板：指定帳號（profile/posts 模式）較慢——光載入個人頁就常花 30s+，60s 容易在抓到貼文前就逾時
  // 而空手而回 → 帳號模式地板拉到 120s；關鍵字搜尋維持 60s 快回。仍隨 maxPosts 放大、夾在端點 290s 上限內。
  // 直接看已正規化的 body（與實際送出 payload 同步）：新 actor mode:posts、或舊 actor 帶 from＝帳號模式。
  const profileMode = ("mode" in body && body.mode === "posts") || ("from" in body && Boolean(body.from));
  const RUN_TIMEOUT_SEC = Math.min(290, Math.max(profileMode ? 120 : 60, Math.ceil(body.maxPosts * 0.3)));
  const params = new URLSearchParams({
    token,
    timeout: String(RUN_TIMEOUT_SEC),
    maxItems: String(body.maxPosts)
  });
  // 出站 URL 一律先過 assertSafePublicUrl（SSRF 守衛，repo 慣例）；host 固定 api.apify.com。
  const url = assertSafePublicUrl(
    `https://api.apify.com/v2/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?${params.toString()}`
  ).href;
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
