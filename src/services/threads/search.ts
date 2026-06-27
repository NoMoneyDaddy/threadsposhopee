// Threads 關鍵字搜尋（threads_keyword_search）：用 owner 的 Threads token 搜公開貼文，
// 供 AI 部落客「Threads 關鍵字」取材模式選題（趨勢偵測）。回傳正規化成 RssItem，與 RSS 來源同型別、共用後續去重/改寫。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import type { RssItem } from "@/services/ai/rss";

const GRAPH = "https://graph.threads.net/v1.0";
const FIELDS = "id,text,permalink,timestamp";

// 把單則貼文文字裁成標題（取首句/首行、限長），原文當摘要。純函式。
export function toTitle(text: string, max = 60): string {
  const first = text.replace(/\s+/g, " ").trim().split(/(?<=[。！？!?\n])/)[0] ?? "";
  const base = (first || text).trim();
  return base.length > max ? `${base.slice(0, max)}…` : base;
}

// 純解析：keyword_search 回傳 { data: [{ id, text, permalink, timestamp }] }。
// 無 text 或無 permalink 的項目略過（無法當素材或回連）。
export function parseKeywordSearch(json: unknown): RssItem[] {
  const rows = (json as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  const out: RssItem[] = [];
  for (const r of rows) {
    const row = r as { text?: unknown; permalink?: unknown; timestamp?: unknown };
    const text = typeof row.text === "string" ? row.text.trim() : "";
    const link = typeof row.permalink === "string" ? row.permalink : "";
    if (!text || !link) continue;
    out.push({
      title: toTitle(text),
      link,
      description: text,
      pubDate: typeof row.timestamp === "string" ? row.timestamp : null
    });
  }
  return out;
}

// 搜尋公開貼文。searchType：TOP（熱門，預設，較適合選題）或 RECENT（最新）。
// 失敗（權限不足/額度/網路）回 []，不阻斷代理人流程（呼叫端可換來源）。
export async function keywordSearch(
  query: string,
  token: string,
  searchType: "TOP" | "RECENT" = "TOP"
): Promise<RssItem[]> {
  const q = query.trim();
  if (!q || !token) return [];
  try {
    const url =
      `${GRAPH}/keyword_search?q=${encodeURIComponent(q)}&search_type=${searchType}` +
      `&fields=${FIELDS}&access_token=${encodeURIComponent(token)}`;
    const res = await fetchWithTimeout(assertSafePublicUrl(url).href, { cache: "no-store" }, 8000);
    if (!res.ok) return [];
    return parseKeywordSearch(await res.json());
  } catch {
    return [];
  }
}
