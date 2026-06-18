// Threads 發文：建立媒體容器 → 發布 → （可選）在自己貼文下留言放分潤連結。
// 對應 n8n 末段缺漏/不完整的發布步驟，這裡補成標準 Graph API 兩段式流程。
import { fetchWithTimeout } from "@/lib/http";

const GRAPH = "https://graph.threads.net/v1.0";

interface PublishInput {
  threadsUserId: string;
  accessToken: string;
  text: string;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "none";
  replyText?: string | null; // 發成功後自動留言（放分潤連結）
}

async function createContainer(input: PublishInput): Promise<string> {
  const params = new URLSearchParams({ access_token: input.accessToken, text: input.text });
  if (input.mediaType === "image" && input.mediaUrl) {
    params.set("media_type", "IMAGE");
    params.set("image_url", input.mediaUrl);
  } else if (input.mediaType === "video" && input.mediaUrl) {
    params.set("media_type", "VIDEO");
    params.set("video_url", input.mediaUrl);
  } else {
    params.set("media_type", "TEXT");
  }
  const res = await fetchWithTimeout(`${GRAPH}/${input.threadsUserId}/threads`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`建立容器失敗 ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

// 影片容器是異步處理，必須等狀態 FINISHED 才能 publish，否則 API 會報錯。
async function waitForContainerReady(creationId: string, token: string): Promise<void> {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetchWithTimeout(`${GRAPH}/${creationId}?fields=status,error_message&access_token=${token}`);
    if (res.ok) {
      const json = await res.json();
      if (json.status === "FINISHED") return;
      if (json.status === "ERROR") throw new Error(`影片處理失敗: ${json.error_message ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("影片處理逾時");
}

async function publishContainer(
  userId: string,
  token: string,
  creationId: string,
  mediaType?: "image" | "video" | "none"
): Promise<string> {
  if (mediaType === "video") await waitForContainerReady(creationId, token);
  const params = new URLSearchParams({ access_token: token, creation_id: creationId });
  const res = await fetchWithTimeout(`${GRAPH}/${userId}/threads_publish`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`發布失敗 ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

export async function publishToThreads(input: PublishInput): Promise<{ postId: string }> {
  const creationId = await createContainer(input);
  const postId = await publishContainer(input.threadsUserId, input.accessToken, creationId, input.mediaType);

  // 自動在貼文下留言放分潤連結（提高觸及，連結不放正文）
  if (input.replyText) {
    try {
      const replyParams = new URLSearchParams({
        access_token: input.accessToken,
        media_type: "TEXT",
        text: input.replyText,
        reply_to_id: postId
      });
      const c = await fetchWithTimeout(`${GRAPH}/${input.threadsUserId}/threads`, { method: "POST", body: replyParams });
      const replyCreation = (await c.json()).id;
      await publishContainer(input.threadsUserId, input.accessToken, replyCreation);
    } catch (e) {
      // 留言失敗不影響主貼文，但記錄下來以便排查（分潤連結沒留成會少觸及）
      console.warn(`貼文 ${postId} 的留言發布失敗:`, e instanceof Error ? e.message : e);
    }
  }
  return { postId };
}
