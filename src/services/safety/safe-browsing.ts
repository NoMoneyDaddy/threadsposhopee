// 來源網址安全掃描（Google Safe Browsing v4 threatMatches:find）：建立短連結時查一次，
// 結果存 DB，中轉頁顯示信任標章。best-effort：未設金鑰或任何錯誤都回 "unknown"（中轉頁降級為
// 「基本安全檢查」），絕不擋建立短連結。掃描的 URL 只放在 request body（非 fetch 目標），無 SSRF 風險。
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";

export type SafetyVerdict = "safe" | "unsafe" | "unknown";

const SB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"];

// 純函式（可單測）：依 API 回應判定。有 matches＝命中威脅名單＝unsafe；空（{}）＝safe。
export function verdictFromResponse(json: unknown): SafetyVerdict {
  const matches = (json as { matches?: unknown } | null)?.matches;
  return Array.isArray(matches) && matches.length > 0 ? "unsafe" : "safe";
}

// 掃描單一來源網址。未設金鑰→"unknown"；命中威脅→"unsafe"；無事→"safe"；錯誤→"unknown"。
export async function checkUrlSafety(url: string): Promise<SafetyVerdict> {
  if (!env.safeBrowsingKey) return "unknown";
  try {
    const res = await fetchWithTimeout(
      `${SB_ENDPOINT}?key=${encodeURIComponent(env.safeBrowsingKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "go2read", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }]
          }
        })
      },
      8000
    );
    if (!res.ok) {
      log.warn("Safe Browsing 查詢失敗", { status: res.status });
      return "unknown";
    }
    const json = await res.json().catch(() => null);
    return verdictFromResponse(json);
  } catch (e) {
    log.warn("Safe Browsing 查詢出錯", { err: e instanceof Error ? e.message : String(e) });
    return "unknown";
  }
}
