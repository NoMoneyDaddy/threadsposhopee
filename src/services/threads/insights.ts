// Threads 貼文互動數據（媒體 insights）：views/likes/replies/reposts/quotes/shares。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

const GRAPH = "https://graph.threads.net/v1.0";
const METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;
type Metric = (typeof METRICS)[number];

export type PostInsights = Record<Metric, number>;

const zero = (): PostInsights => ({ views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0 });

// 純解析：媒體 insights 用 values[0].value；保險起見也吃 total_value.value（user insights 格式）。
export function parsePostInsights(json: unknown): PostInsights {
  const out = zero();
  const rows = (json as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const name = (r as { name?: string })?.name;
    if (!name || !(name in out)) continue;
    const tv = (r as { total_value?: { value?: unknown } })?.total_value?.value;
    const vv = (r as { values?: { value?: unknown }[] })?.values?.[0]?.value;
    const v = typeof tv === "number" ? tv : typeof vv === "number" ? vv : 0;
    out[name as Metric] = v;
  }
  return out;
}

export async function getPostInsights(mediaId: string, token: string): Promise<PostInsights | null> {
  try {
    const url = `${GRAPH}/${encodeURIComponent(mediaId)}/insights?metric=${METRICS.join(",")}&access_token=${encodeURIComponent(token)}`;
    // 統一走 fetchWithTimeout（內建逾時，無 AbortController 殘留）+ assertSafePublicUrl（SSRF 一致防護）
    const res = await fetchWithTimeout(assertSafePublicUrl(url).href, { cache: "no-store" }, 8000);
    if (!res.ok) return null;
    return parsePostInsights(await res.json());
  } catch {
    return null;
  }
}
