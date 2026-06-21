// 輕量 RSS 解析（無外部依賴）：取 <item> 的 title/link/description/pubDate。
// 來源多為 Google News RSS。fetch 一律過逾時＋SSRF 守衛。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

// 解 CDATA 與常見 HTML 實體，並去標籤（摘要可能含 HTML）。純函式。
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    // 先還原實體，讓被編碼的 HTML 標籤現形
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    // 再去標籤（去空字串，避免在中文間插入多餘空白）
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

// 解析 RSS XML 為項目陣列。純函式可測。
export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: tag(block, "description"),
      pubDate: tag(block, "pubDate") || null
    });
  }
  return items;
}

// 抓單一 RSS 來源並解析（失敗回空陣列，不擋其他來源）。
export async function fetchRssItems(url: string): Promise<RssItem[]> {
  try {
    assertSafePublicUrl(url);
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; IwantPoBot/1.0)" } }, 10000);
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}
