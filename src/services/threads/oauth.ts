// Threads 帳號連結：OAuth 一鍵流程已移除（需 Meta App Review/商業驗證才能對外開放，無法達成）。
// 現以「手動貼 access token」綁定（見 /api/accounts/threads）。本檔僅保留：
// - threadsScopeEnabled：成效頁判斷目前請求的授權範圍是否含某 scope。
// - getThreadsProfile：手動貼 token 時用來取回帳號 id/暱稱/頭像並驗證 token。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

const GRAPH = "https://graph.threads.net";
// 期望的授權範圍（建立 Threads App 時於後台勾選）。可用 THREADS_SCOPES 覆寫；
// 逐項去空白並濾掉空值（避免誤設帶內部空白被原樣帶入）。
const DEFAULT_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_keyword_search"
].join(",");
const SCOPES =
  process.env.THREADS_SCOPES?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",") || DEFAULT_SCOPES;

// 目前實際期望的授權範圍是否包含某 scope（成效頁據此判斷「重新授權能否拿到該權限」）。
export function threadsScopeEnabled(scope: string): boolean {
  return SCOPES.split(",").includes(scope);
}

export interface ThreadsProfile {
  id?: string; // Threads user id（手動貼 token 時用來自動帶出帳號 id）
  username: string;
  name?: string; // Threads 上的顯示名稱（缺失時為 undefined，避免覆寫既有值）
  avatarUrl?: string; // 個人頭像 URL（缺失時為 undefined）
}

// 取得 Threads 個人檔案（id / username / 顯示名稱 / 頭像）。手動貼 token 時用來驗證並帶出帳號資料。
// 缺失欄位回 undefined（不要正規化成空字串）——否則重新綁定時會用空值覆寫既有真實資料。
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
