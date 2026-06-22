import { fetchWithTimeout } from "@/lib/http";

const GRAPH = "https://graph.threads.net/v1.0";

// 讀回某貼文的文字內容（驗證贊助連結是否仍在）。貼文被刪除或讀取失敗 → 回 null（視為違規）。
export async function getPostText(postId: string, token: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `${GRAPH}/${encodeURIComponent(postId)}?fields=text&access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.text === "string" ? json.text : "";
  } catch {
    return null;
  }
}

// 列出某帳號近期貼文（id+text）：給「發後讀回自動驗證」比對用。失敗回空陣列。
export async function listRecentThreadsPosts(
  threadsUserId: string,
  token: string,
  limit = 25
): Promise<{ id: string; text: string }[]> {
  try {
    const res = await fetchWithTimeout(
      `${GRAPH}/${encodeURIComponent(threadsUserId)}/threads?fields=id,text&limit=${limit}&access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return [];
    const json = await res.json();
    const arr = Array.isArray(json?.data) ? json.data : [];
    return arr
      .map((p: { id?: unknown; text?: unknown }) => ({
        id: String(p.id ?? ""),
        text: typeof p.text === "string" ? p.text : ""
      }))
      .filter((p: { id: string }) => p.id);
  } catch {
    return [];
  }
}
