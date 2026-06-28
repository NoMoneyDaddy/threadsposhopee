import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";
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
    log.warn("validateApifyToken 無法確認，放行存檔", { err: e });
    return { ok: true };
  }
}

// Cloudinary（unsigned 上傳設定）：cloud name + unsigned preset 無法用「讀取式」API 驗證，
// 只能實際試一次未簽名上傳。做法：上傳 1x1 透明 PNG（要求回 delete_token），成功代表 cloud+preset
// 皆有效且 preset 為 unsigned；再用 delete_token 即時刪掉測試圖（免 API secret）。
// 明確被拒（4xx）→ invalid 擋下；網路錯誤／逾時無法確認 → 放行（不因第三方故障擋住）。
const TINY_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export async function validateCloudinaryUnsigned(cloud: string, preset: string): Promise<KeyCheck> {
  // cloud/preset 已由 parseCloudinaryInput 限定 ^[a-zA-Z0-9_-]{1,64}$，可安全內插進 path。
  try {
    const url = assertSafePublicUrl(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`);
    const body = new URLSearchParams({ file: TINY_PNG_DATA_URI, upload_preset: preset, return_delete_token: "true" });
    const res = await fetchWithTimeout(
      url,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      8000
    );
    if (res.ok) {
      // 成功：盡力刪掉測試圖（用 delete_token，免 API secret），失敗也不影響驗證結果。
      const json = (await res.json().catch(() => null)) as { delete_token?: unknown } | null;
      const token = typeof json?.delete_token === "string" ? json.delete_token : null;
      if (token) {
        try {
          const delUrl = assertSafePublicUrl(`https://api.cloudinary.com/v1_1/${cloud}/delete_by_token`);
          await fetchWithTimeout(
            delUrl,
            { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) },
            8000
          );
        } catch (e) {
          log.warn("Cloudinary 驗證後刪除測試圖失敗（不影響綁定）", { err: e });
        }
      } else {
        // 回應缺 delete_token（非預期回應/非 JSON）：無法清掉測試圖，記錄以利觀察（不含機密）。
        log.warn("Cloudinary 驗證上傳成功但缺 delete_token，未能刪除測試圖", { cloud });
      }
      return { ok: true };
    }
    // 僅「明確無效」的狀態才擋（cloud/preset 錯或非 unsigned）；408/429 等暫時性 4xx 視為無法確認 → 放行。
    if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404) {
      const txt = await res.text().catch(() => "");
      const reason = /preset/i.test(txt)
        ? "Cloudinary upload preset 無效或非 unsigned（請確認 preset 名稱與簽署模式）"
        : "Cloudinary 設定無效（請確認 cloud name 與 upload preset）";
      return { ok: false, reason };
    }
    // 其餘（408/429/5xx 等暫時性）：無法確認 → 放行（不因第三方限流/故障擋住綁定）。
    log.warn("Cloudinary 驗證回應無法判定有效性，放行存檔", { status: res.status });
    return { ok: true };
  } catch (e) {
    log.warn("validateCloudinaryUnsigned 無法確認，放行存檔", { err: e });
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
    log.warn("validateGeminiKey 無法確認，放行存檔", { err: e });
    return { ok: true };
  }
}
