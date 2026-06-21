import { createHmac, timingSafeEqual } from "crypto";

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// 解析並驗證 Meta 的 signed_request（解除授權／資料刪除回呼）。
// 格式：<base64url(HMAC-SHA256(payload, appSecret))>.<base64url(JSON payload)>。驗章失敗回 null。
export function parseSignedRequest(signed: string, appSecret: string): { user_id?: string } | null {
  const dot = signed.indexOf(".");
  if (dot < 0) return null;
  const sig = signed.slice(0, dot);
  const payload = signed.slice(dot + 1);
  if (!sig || !payload) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  const got = b64urlToBuf(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    return JSON.parse(b64urlToBuf(payload).toString("utf8"));
  } catch {
    return null;
  }
}
