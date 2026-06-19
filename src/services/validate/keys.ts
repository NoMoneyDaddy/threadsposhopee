import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

// 綁定即驗證：存金鑰前先打對方 API 確認有效。
// 規則：明確被拒（401/403）→ invalid，擋下存檔；
//       網路錯誤／逾時無法確認 → unknown，仍照存（不因第三方故障擋住使用者）。
export type KeyCheck = { ok: boolean; reason?: string };

const APIFY_ME = "https://api.apify.com/v2/users/me";
const GEMINI_MODELS = "https://generativelanguage.googleapis.com/v1beta/models";

// Apify：GET /v2/users/me 帶 Bearer token 能拿到自己帳號即有效。
// 金鑰走 Authorization 標頭而非 query，避免寫進伺服器／代理日誌。
export async function validateApifyToken(token: string): Promise<KeyCheck> {
  try {
    const url = assertSafePublicUrl(APIFY_ME);
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } }, 8000);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Apify token 無效（驗證被拒）" };
    }
    return { ok: true };
  } catch (e) {
    // 連不上 Apify，無法確認 → 放行（記 log 便於排查，不含金鑰）
    console.warn("validateApifyToken 無法確認，放行存檔：", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}

// Gemini：GET /v1beta/models 帶 x-goog-api-key 能列模型即有效。
// 金鑰走標頭而非 query，避免寫進日誌。
export async function validateGeminiKey(key: string): Promise<KeyCheck> {
  try {
    const url = assertSafePublicUrl(GEMINI_MODELS);
    const res = await fetchWithTimeout(url, { headers: { "x-goog-api-key": key } }, 8000);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Gemini API key 無效（驗證被拒）" };
    }
    return { ok: true };
  } catch (e) {
    console.warn("validateGeminiKey 無法確認，放行存檔：", e instanceof Error ? e.message : e);
    return { ok: true };
  }
}
