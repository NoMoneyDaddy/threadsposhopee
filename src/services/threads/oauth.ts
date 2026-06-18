// Threads OAuth：一鍵連發文帳號，取代手貼 access token。
// 流程：authorize → 拿 code → 換短期 token（含 user_id）→ 換 60 天長期 token → 取 username。
import { exchangeForLongLivedToken } from "./token";

const GRAPH = "https://graph.threads.net";
const AUTHORIZE = "https://threads.net/oauth/authorize";
const SCOPES = "threads_basic,threads_content_publish";

// 組授權連結（導使用者去 Threads 同意頁）。state 用來防 CSRF / 帶回 next。
export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: "code",
    state
  });
  return `${AUTHORIZE}?${params.toString()}`;
}

// 用 code 換短期 token（回傳 access_token + user_id）。
export async function exchangeCodeForToken(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; userId: string }> {
  const body = new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code
  });
  const res = await fetch(`${GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error(`換 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, userId: String(json.user_id) };
}

// 取得 Threads 使用者名稱（顯示用 label）。
export async function getThreadsUsername(accessToken: string): Promise<string> {
  const url = `${GRAPH}/v1.0/me?fields=username&access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取 username 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.username ?? "";
}

// 完整連帳號：code → 長期 token + user_id + username + 到期日。
export async function connectThreadsAccount(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ userId: string; username: string; accessToken: string; expiresAt: string }> {
  const { accessToken: shortToken, userId } = await exchangeCodeForToken(input);
  const { accessToken, expiresInSec } = await exchangeForLongLivedToken(shortToken, input.clientSecret);
  const username = await getThreadsUsername(accessToken).catch(() => "");
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
  return { userId, username: username || `threads_${userId}`, accessToken, expiresAt };
}
