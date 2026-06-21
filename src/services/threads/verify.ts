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
