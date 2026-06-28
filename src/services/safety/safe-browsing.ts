// 來源網址安全掃描（Google Safe Browsing v4 threatMatches:find）：建立短連結時查一次，
// 結果存 DB，中轉頁顯示信任標章。best-effort：未設金鑰或任何錯誤都回 "unknown"（中轉頁降級為
// 「基本安全檢查」），絕不擋建立短連結。掃描的 URL 只放在 request body（非 fetch 目標），無 SSRF 風險。
import { env } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { log } from "@/lib/logger";

export type SafetyVerdict = "safe" | "unsafe" | "unknown";

const SB_ENDPOINT = "https://safebrowsing.googleapis.com/v4/threatMatches:find";
const THREAT_TYPES = ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"];
// best-effort 不擋建立短連結：用較短預算（非預設 8s），最差也只拖慢建立流程約 2.5s。
const SB_TIMEOUT_MS = 2500;

// 純函式（可單測）：依 API 回應判定。
// 空回應（{}）＝無威脅＝safe；matches 有命中＝unsafe；
// 解析失敗/非物件、或 matches 存在但非陣列（格式異常）＝unknown（不把「未完成掃描」誤判為安全）。
export function verdictFromResponse(json: unknown): SafetyVerdict {
  if (!json || typeof json !== "object") return "unknown";
  const matches = (json as { matches?: unknown }).matches;
  if (matches === undefined) return "safe";
  if (!Array.isArray(matches)) return "unknown";
  return matches.length > 0 ? "unsafe" : "safe";
}

// 掃描單一來源網址。未設金鑰→"unknown"；命中威脅→"unsafe"；無事→"safe"；錯誤/未知→"unknown"。
export async function checkUrlSafety(url: string): Promise<SafetyVerdict> {
  if (!env.safeBrowsingKey) return "unknown";
  try {
    // 縱深防禦：即使 endpoint 為固定常數，仍依規範先驗證 outbound fetch 目標為安全公開 URL。
    const endpoint = assertSafePublicUrl(`${SB_ENDPOINT}?key=${encodeURIComponent(env.safeBrowsingKey)}`).href;
    const res = await fetchWithTimeout(
      endpoint,
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
      SB_TIMEOUT_MS
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
