import { fetchWithTimeout } from "@/lib/http";
import { getApifyCredentials } from "@/lib/credentials";

// 使用者 Apify 本月用量／額度（USD）。免費帳號約每月 US$5 平台額度。
export interface ApifyUsage {
  usedUsd: number; // 本月已用
  limitUsd: number | null; // 月上限（查不到為 null）
  remainingUsd: number | null; // 剩餘（有上限才算得出）
}

// 解析 Apify GET /v2/users/me/limits 回應。欄位缺失／非數值 → null（不誤報）。純函式可測。
export function parseApifyUsage(json: unknown): ApifyUsage | null {
  const d = (json as { data?: { current?: { monthlyUsageUsd?: unknown }; limits?: { maxMonthlyUsageUsd?: unknown } } } | null)?.data;
  if (!d || typeof d !== "object") return null;
  const used = Number(d.current?.monthlyUsageUsd);
  if (!Number.isFinite(used)) return null;
  const rawLimit = Number(d.limits?.maxMonthlyUsageUsd);
  const limitUsd = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  const remainingUsd = limitUsd != null ? Math.max(0, limitUsd - used) : null;
  return { usedUsd: used, limitUsd, remainingUsd };
}

// 查某使用者的 Apify 本月用量／額度。未綁金鑰或查詢失敗一律回 null（純顯示用，不擋頁）。
export async function getApifyUsage(ownerId: string): Promise<ApifyUsage | null> {
  const creds = await getApifyCredentials(ownerId);
  if (!creds?.token) return null;
  try {
    // token 走 Authorization 標頭（不放 URL，避免在日誌／代理留下明文金鑰）；固定公網 API，免 SSRF 守衛。
    // 純顯示用、逾時短（4s），避免 Apify 回應慢時拖住整個抓文頁渲染。
    const res = await fetchWithTimeout(
      "https://api.apify.com/v2/users/me/limits",
      { headers: { Authorization: `Bearer ${creds.token}` } },
      4000
    );
    if (!res.ok) return null;
    return parseApifyUsage(await res.json().catch(() => null));
  } catch {
    return null;
  }
}
