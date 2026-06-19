import { fetchWithTimeout } from "@/lib/http";

// 綁定即驗證：存金鑰前先打對方 API 確認有效。
// 規則：明確被拒（401/403）→ invalid，擋下存檔；
//       網路錯誤／逾時無法確認 → unknown，仍照存（不因第三方故障擋住使用者）。
export type KeyCheck = { ok: boolean; reason?: string };

// Apify：GET /v2/users/me?token= 能拿到自己帳號即有效。
export async function validateApifyToken(token: string): Promise<KeyCheck> {
  try {
    const res = await fetchWithTimeout(
      `https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`,
      {},
      8000
    );
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Apify token 無效（驗證被拒）" };
    }
    return { ok: true };
  } catch {
    // 連不上 Apify，無法確認 → 放行
    return { ok: true };
  }
}

// Gemini：GET /v1beta/models?key= 能列模型即有效。
export async function validateGeminiKey(key: string): Promise<KeyCheck> {
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      {},
      8000
    );
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, reason: "Gemini API key 無效（驗證被拒）" };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
