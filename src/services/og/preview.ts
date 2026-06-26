// 來源網址預覽（Open Graph）：抓取頁面的 og:image／og:title／og:description（退回 <title>），
// 供短連結中轉頁與 Threads 連結 unfurl 自動帶預覽圖／標題／描述。
// 安全：URL 一律過 assertSafePublicUrl（SSRF）、走 fetchWithTimeout（逾時保護）；絕不丟錯（best-effort）。
import { assertSafePublicUrl } from "@/lib/url-guard";
import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";

export interface LinkPreview {
  title: string | null;
  imageUrl: string | null;
  description: string | null;
}

const EMPTY: LinkPreview = { title: null, imageUrl: null, description: null };

// 解析 HTML 取 OG/meta（純函式，可測）。baseUrl 用於把相對 og:image 還原成絕對網址。
export function parseOgTags(html: string, baseUrl: string): LinkPreview {
  // 取 <head> 區段即可（避免掃整頁）；找不到就用前 100KB。
  const head = html.slice(0, 100_000);
  const metaContent = (patterns: RegExp[]): string | null => {
    for (const re of patterns) {
      const m = head.match(re);
      if (m?.[1]) {
        const v = decodeEntities(m[1].trim());
        if (v) return v;
      }
    }
    return null;
  };
  // property/name 可能在 content 前或後，故兩種順序都試。
  const prop = (key: string) => [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i")
  ];
  const title =
    metaContent([...prop("og:title"), ...prop("twitter:title")]) ??
    (head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ? decodeEntities(head.match(/<title[^>]*>([^<]*)<\/title>/i)![1].trim()) : null);
  const description = metaContent([...prop("og:description"), ...prop("twitter:description"), ...prop("description")]);
  const rawImage = metaContent([...prop("og:image:secure_url"), ...prop("og:image"), ...prop("twitter:image")]);
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, baseUrl).toString(); // 相對 → 絕對
    } catch {
      imageUrl = null;
    }
  }
  return { title: title || null, imageUrl, description: description || null };
}

// 最常見的 HTML 實體還原（OG content 內常見 &amp; &quot; 等）。
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// 抓取來源網址的預覽（best-effort）。失敗一律回空，不影響短連結建立。
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    const safe = assertSafePublicUrl(url); // SSRF：擋內網/非法協定
    const res = await fetchWithTimeout(
      safe.toString(),
      { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; iwantpo-link-preview)" } },
      6000
    );
    if (!res.ok) return EMPTY;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) return EMPTY; // 非 HTML（如圖片/PDF）不解析
    const html = await res.text();
    // og:image 可能是相對路徑，用最終 URL（含跳轉）當 base。
    return parseOgTags(html, res.url || safe.toString());
  } catch (e) {
    log.warn("來源預覽抓取失敗", { url, err: e instanceof Error ? e.message : e });
    return EMPTY;
  }
}
