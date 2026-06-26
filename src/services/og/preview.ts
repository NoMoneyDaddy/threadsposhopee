// 來源網址預覽（Open Graph）：抓取頁面的 og:image／og:title／og:description（退回 <title>），
// 供短連結中轉頁與 Threads 連結 unfurl 自動帶預覽圖／標題／描述。
// 安全：URL 一律走 fetchSafePublicUrl（每一跳重驗 SSRF + 逾時保護），擋 SSRF-via-redirect；絕不丟錯（best-effort）。
import { fetchSafePublicUrl } from "@/lib/url-guard";
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
      // content 值在 group 2（group 1 為引號 delimiter，供 backreference）。
      if (m?.[2]) {
        const v = decodeEntities(m[2].trim());
        if (v) return v;
      }
    }
    return null;
  };
  // property/name 可能在 content 前或後，故兩種順序都試。引號 delimiter 用 backreference 擷取，
  // 才能容許值內含另一種引號（如 content="Bob's post"）而不被提前截斷。
  const prop = (key: string) => [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=(["'])(.*?)\\1`, "i"),
    new RegExp(`<meta[^>]+content=(["'])(.*?)\\1[^>]*(?:property|name)=["']${key}["']`, "i")
  ];
  const titleTag = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  const title =
    metaContent([...prop("og:title"), ...prop("twitter:title")]) ??
    (titleTag ? decodeEntities(titleTag) : null);
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

// 解析只需前 100KB；多抓一點當緩衝，超過即中止，避免超大回應造成記憶體/延遲 DoS（URL 由使用者可控）。
const MAX_PREVIEW_BYTES = 120_000;

// 串流讀取回應，累積到上限即停止並取消下載（best-effort，回傳已讀取的片段）。
async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}

// 抓取來源網址的預覽（best-effort）。失敗一律回空，不影響短連結建立。
export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  try {
    // fetchSafePublicUrl：每一跳重驗 SSRF（擋公網→30x→內網繞過）＋逾時保護＋跨域剝除敏感標頭。
    const res = await fetchSafePublicUrl(
      url,
      { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; iwantpo-link-preview)" } },
      6000
    );
    if (!res.ok) return EMPTY;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) return EMPTY; // 非 HTML（如圖片/PDF）不解析
    const html = await readCappedText(res, MAX_PREVIEW_BYTES);
    // og:image 可能是相對路徑，用最終 URL（含跳轉）當 base。
    return parseOgTags(html, res.url || url);
  } catch (e) {
    // 只記主機名，不記完整 URL（query 可能含 token/ref 等敏感參數）。
    let host = "?";
    try {
      host = new URL(url).host;
    } catch {
      /* 無法解析則略過 */
    }
    log.warn("來源預覽抓取失敗", { host, err: e instanceof Error ? e.message : e });
    return EMPTY;
  }
}
