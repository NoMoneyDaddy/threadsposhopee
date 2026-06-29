// 自動抓文設定（一份可保存的設定，不綁發文帳號）。關鍵字＝拿去 Threads 搜「含該字的貼文」。
// 預設關鍵字 s.shopee.tw（蝦皮分潤短連結網域）＝抓「貼文裡帶蝦皮連結」的貼文當素材來源。
export const DEFAULT_SCRAPE_KEYWORD = "s.shopee.tw";
export const MAX_SCRAPE_KEYWORDS = 10;
export const SCRAPE_POSTS_MIN = 1;
// actor schema 的 maxPosts 上限＝1000。實際取量受 run-sync 端點 300s 硬上限與每頁約 10 篇制約，
// 設很大時可能取不滿（取多少算多少），費用也隨之增加（每 1000 筆約 US$5，使用者自付）。
export const SCRAPE_POSTS_MAX = 1000;

export type ScrapeSort = "top" | "recent";

export interface ScrapeConfig {
  keywords: string[];
  postsLimit: number; // 每個關鍵字每次抓幾篇
  username: string; // 目標帳號（選填，無預設）：限定只搜該帳號的貼文（→ actor 的 from）
  sort: ScrapeSort; // 排序：top（熱門）／recent（最新）
  after: string; // 起始日（含），YYYY-MM-DD；空＝不限
  before: string; // 結束日（含），YYYY-MM-DD；空＝不限
}

// 正規化關鍵字：去前後空白、濾空、去重（保序）、取前 N。空清單時退回預設關鍵字。純函式可測。
export function normalizeScrapeKeywords(input: unknown): string[] {
  const arr = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[\n,]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const k = typeof raw === "string" ? raw.trim() : "";
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= MAX_SCRAPE_KEYWORDS) break;
  }
  return out.length ? out : [DEFAULT_SCRAPE_KEYWORD];
}

// 夾每次抓取篇數到合理範圍、取整；非數值退回 3。
export function normalizePostsLimit(input: unknown): number {
  const n = typeof input === "number" && Number.isFinite(input) ? Math.round(input) : 3;
  return Math.min(SCRAPE_POSTS_MAX, Math.max(SCRAPE_POSTS_MIN, n));
}

// 目標帳號（actor 的 from）僅允許 ^[a-zA-Z0-9._]+$（與 scraper 端 THREADS_USERNAME_RE 一致）。
const SCRAPE_USERNAME_RE = /^[a-zA-Z0-9._]+$/;

// 正規化目標帳號：去前後空白、去單一前導 @；空字串＝不限定帳號（無預設）。
// 非空但含非法字元時拋錯（fail fast，避免靜默刪字元改成另一個真實帳號）。純函式可測。
export function normalizeScrapeUsername(input: unknown): string {
  const raw = typeof input === "string" ? input.trim().replace(/^@/, "") : "";
  if (!raw) return "";
  if (!SCRAPE_USERNAME_RE.test(raw)) {
    throw new Error(`無效的目標帳號「${raw}」：僅能包含英數字、底線與點（a-z A-Z 0-9 . _）`);
  }
  return raw;
}

// 排序：只接受 top（熱門）／recent（最新）；其餘退回 recent。純函式可測。
export function normalizeScrapeSort(input: unknown): ScrapeSort {
  return input === "top" ? "top" : "recent";
}

// 日期區間：空＝不限；否則須為合法 YYYY-MM-DD（actor 的 after／before 格式）。
// 非空但格式/日期不合法時拋錯（fail fast，與帳號驗證一致），讓 API 回 400 而非默默忽略。純函式可測。
const SCRAPE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function normalizeScrapeDate(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  if (!SCRAPE_DATE_RE.test(raw) || Number.isNaN(Date.parse(raw))) {
    throw new Error(`無效的日期「${raw}」：請用 YYYY-MM-DD 格式`);
  }
  return raw;
}
