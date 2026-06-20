// Threads 長期 token 展期（對應 n8n「Token 展期 / Refresh Token」流程）。
// 長期 token 有效約 60 天，到期前需 refresh。
import { fetchWithRetry } from "@/lib/http";

const GRAPH = "https://graph.threads.net";

// 短期 token 換 60 天長期 token
export async function exchangeForLongLivedToken(shortToken: string, clientSecret: string): Promise<{
  accessToken: string;
  expiresInSec: number;
}> {
  const url = `${GRAPH}/access_token?grant_type=th_exchange_token&client_secret=${clientSecret}&access_token=${shortToken}`;
  const res = await fetchWithRetry(url); // token 交換為冪等 GET，可安全重試 429
  if (!res.ok) throw new Error(`換長期 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, expiresInSec: json.expires_in };
}

// 展期（refresh）長期 token
export async function refreshLongLivedToken(longToken: string): Promise<{
  accessToken: string;
  expiresInSec: number;
}> {
  const url = `${GRAPH}/refresh_access_token?grant_type=th_refresh_token&access_token=${longToken}`;
  const res = await fetchWithRetry(url); // 展期為冪等 GET，可安全重試 429
  if (!res.ok) throw new Error(`展期 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, expiresInSec: json.expires_in };
}
