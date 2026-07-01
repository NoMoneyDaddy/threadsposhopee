import { fetchWithTimeout } from "@/lib/http";

const GRAPH = "https://graph.threads.net/v1.0";

// 讀回某貼文的文字內容（驗證贊助連結是否仍在）。
// 區分三態，避免把「暫時讀不到」誤判成「貼文被刪」而放過真竄改：
//  - ok：讀到內容（text 可能空字串）
//  - deleted：貼文確定不存在（HTTP 404 或 Graph error code 100＝object 不存在）＝正當下架
//  - unreadable：token 失效(190)/限流/5xx/逾時等暫時性 → 呼叫端應略過、下輪重試（不判違規、不當下架）
export type PostReadResult = { status: "ok"; text: string } | { status: "deleted" } | { status: "unreadable" };

export async function getPostText(postId: string, token: string): Promise<PostReadResult> {
  try {
    const res = await fetchWithTimeout(
      `${GRAPH}/${encodeURIComponent(postId)}?fields=text&access_token=${encodeURIComponent(token)}`
    );
    if (res.ok) {
      const json = await res.json();
      return { status: "ok", text: typeof json.text === "string" ? json.text : "" };
    }
    // 非 2xx：解析 Graph 錯誤碼判斷是「不存在（刪除）」還是「暫時讀不到」。
    let code: number | undefined;
    try {
      const j = await res.json();
      code = typeof j?.error?.code === "number" ? j.error.code : undefined;
    } catch {
      /* 無 JSON body */
    }
    const notFound = res.status === 404 || code === 100; // 100＝object does not exist（含已刪除）
    return notFound ? { status: "deleted" } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" }; // 逾時/網路錯誤 → 暫時讀不到
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
