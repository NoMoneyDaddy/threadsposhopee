// 自動抓文設定（一份可保存的設定，不綁發文帳號）。關鍵字＝拿去 Threads 搜「含該字的貼文」。
// 預設關鍵字 s.shopee.tw（蝦皮分潤短連結網域）＝抓「貼文裡帶蝦皮連結」的貼文當素材來源。
export const DEFAULT_SCRAPE_KEYWORD = "s.shopee.tw";
export const MAX_SCRAPE_KEYWORDS = 10;
export const SCRAPE_POSTS_MIN = 1;
export const SCRAPE_POSTS_MAX = 20;

export interface ScrapeConfig {
  keywords: string[];
  postsLimit: number; // 每個關鍵字每次抓幾篇
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
