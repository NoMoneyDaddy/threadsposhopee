// Threads 長期 token 展期（對應 n8n「Token 展期 / Refresh Token」流程）。
// 長期 token 有效約 60 天，到期前需 refresh。
import { fetchWithRetry } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

const GRAPH = "https://graph.threads.net";

// 帶 HTTP 狀態碼的 token 錯誤，供展期 worker 分類「token 確定失效」vs「暫時性」。
export class ThreadsTokenError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ThreadsTokenError";
  }
}

// 是否為「token 確定失效」（需重新授權）：400/401/403。
// 其餘（5xx、429 限流、網路/逾時無狀態）視為暫時性，應下輪重試而非標 error。純函式可測。
export function isPermanentTokenError(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

// 短期 token 換 60 天長期 token
export async function exchangeForLongLivedToken(shortToken: string, clientSecret: string): Promise<{
  accessToken: string;
  expiresInSec: number;
}> {
  const url = `${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${clientSecret}&access_token=${shortToken}`;
  const res = await fetchWithRetry(assertSafePublicUrl(url).href); // SSRF 守衛＋token 交換為冪等 GET，可安全重試 429
  if (!res.ok) throw new ThreadsTokenError(res.status, `換長期 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, expiresInSec: json.expires_in };
}

// 展期（refresh）長期 token
export async function refreshLongLivedToken(longToken: string): Promise<{
  accessToken: string;
  expiresInSec: number;
}> {
  const url = `${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${longToken}`;
  const res = await fetchWithRetry(assertSafePublicUrl(url).href); // SSRF 守衛＋展期為冪等 GET，可安全重試 429
  if (!res.ok) throw new ThreadsTokenError(res.status, `展期 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, expiresInSec: json.expires_in };
}
