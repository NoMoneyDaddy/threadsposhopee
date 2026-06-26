// Threads OAuth：一鍵連發文帳號，取代手貼 access token。
// 流程：authorize → 拿 code → 換短期 token（含 user_id）→ 換 60 天長期 token → 取 username。
import { exchangeForLongLivedToken } from "./token";
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

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
  const res = await fetchWithTimeout(`${GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) throw new Error(`換 token 失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return { accessToken: json.access_token, userId: String(json.user_id) };
}

export interface ThreadsProfile {
  id?: string; // Threads user id（手動貼 token 時用來自動帶出帳號 id）
  username: string;
  name?: string; // Threads 上的顯示名稱（缺失時為 undefined，避免覆寫既有值）
  avatarUrl?: string; // 個人頭像 URL（缺失時為 undefined）
}

// 取得 Threads 個人檔案（id / username / 顯示名稱 / 頭像）。顯示用。
// 缺失欄位回 undefined（不要正規化成空字串）——否則重新授權時會用空值覆寫既有真實資料。
export async function getThreadsProfile(accessToken: string): Promise<ThreadsProfile> {
  const url = `${GRAPH}/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${encodeURIComponent(accessToken)}`;
  // 固定 Graph 主機，仍依專案規範過 SSRF 守衛再 fetch。
  const res = await fetchWithTimeout(assertSafePublicUrl(url).href);
  if (!res.ok) throw new Error(`取個人檔案失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  return {
    id: str(json.id),
    username: json.username ?? "",
    name: str(json.name),
    avatarUrl: str(json.threads_profile_picture_url)
  };
}

// 完整連帳號：code → 長期 token + user_id + 個人檔案（username/名稱/頭像）+ 到期日。
export async function connectThreadsAccount(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ userId: string; username: string; name?: string; avatarUrl?: string; accessToken: string; expiresAt: string }> {
  const { accessToken: shortToken, userId } = await exchangeCodeForToken(input);
  const { accessToken, expiresInSec } = await exchangeForLongLivedToken(shortToken, input.clientSecret);
  // 個人檔案抓取失敗不阻斷連結（頭像/名稱屬選配，可日後重新授權補上）。
  // 失敗時回 null → name/avatarUrl 維持 undefined，重新授權時才不會以空字串覆寫既有的真實資料。
  const profile = await getThreadsProfile(accessToken).catch(() => null);
  // 防禦：API 若回傳缺失/非數值的 expires_in，避免 new Date(NaN).toISOString() 拋 RangeError；預設 60 天
  const seconds = typeof expiresInSec === "number" && !Number.isNaN(expiresInSec) ? expiresInSec : 60 * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
  return {
    userId,
    username: profile?.username || `threads_${userId}`,
    name: profile?.name,
    avatarUrl: profile?.avatarUrl,
    accessToken,
    expiresAt
  };
}
