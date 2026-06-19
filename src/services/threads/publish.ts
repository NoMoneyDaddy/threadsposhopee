// Threads 發文：建立媒體容器 → 發布 → （可選）在自己貼文下留言放分潤連結。
// 支援單圖/單片、純文字，以及多媒體輪播（carousel）。
import { fetchWithTimeout } from "@/lib/http";
import type { DraftMedia } from "@/lib/types";

const GRAPH = "https://graph.threads.net/v1.0";

interface PublishInput {
  threadsUserId: string;
  accessToken: string;
  text: string;
  media?: DraftMedia[]; // 0=純文字、1=單一媒體、>1=輪播
  // 向後相容：舊呼叫端仍可傳單一 media
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "none";
  replyText?: string | null; // 發成功後自動留言（放分潤連結）
}

function resolveMedia(input: PublishInput): DraftMedia[] {
  if (input.media && input.media.length > 0) return input.media;
  if (input.mediaUrl && (input.mediaType === "image" || input.mediaType === "video")) {
    return [{ url: input.mediaUrl, type: input.mediaType }];
  }
  return [];
}

// 對單一媒體項設定容器參數（IMAGE/VIDEO + 對應 url）。
function setMediaParams(params: URLSearchParams, item: DraftMedia): void {
  if (item.type === "image") {
    params.set("media_type", "IMAGE");
    params.set("image_url", item.url);
  } else {
    params.set("media_type", "VIDEO");
    params.set("video_url", item.url);
  }
}

async function postThreads(userId: string, token: string, params: URLSearchParams): Promise<string> {
  params.set("access_token", token);
  const res = await fetchWithTimeout(`${GRAPH}/${userId}/threads`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`建立容器失敗 ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

// 影片/輪播容器是異步處理，必須等狀態 FINISHED 才能 publish，否則 API 會報錯。
async function waitForContainerReady(creationId: string, token: string): Promise<void> {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetchWithTimeout(`${GRAPH}/${creationId}?fields=status,error_message&access_token=${token}`);
    if (res.ok) {
      const json = await res.json();
      if (json.status === "FINISHED") return;
      if (json.status === "ERROR") throw new Error(`媒體處理失敗: ${json.error_message ?? "unknown"}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("媒體處理逾時");
}

// 建立要發布的頂層容器，回傳 creationId 與是否需在 publish 前等待就緒。
async function buildCreation(input: PublishInput, media: DraftMedia[]): Promise<{ creationId: string; needWait: boolean }> {
  // 純文字或單一媒體：單一容器（文案放這裡）
  if (media.length <= 1) {
    const params = new URLSearchParams({ text: input.text });
    if (media.length === 1) setMediaParams(params, media[0]);
    else params.set("media_type", "TEXT");
    const creationId = await postThreads(input.threadsUserId, input.accessToken, params);
    return { creationId, needWait: media[0]?.type === "video" };
  }

  // 輪播：先建各子項容器（is_carousel_item），影片子項需等就緒，再建輪播母容器（文案放母容器）
  const childIds: string[] = [];
  for (const item of media) {
    const p = new URLSearchParams({ is_carousel_item: "true" });
    setMediaParams(p, item);
    const childId = await postThreads(input.threadsUserId, input.accessToken, p);
    if (item.type === "video") await waitForContainerReady(childId, input.accessToken);
    childIds.push(childId);
  }
  const cp = new URLSearchParams({ media_type: "CAROUSEL", text: input.text, children: childIds.join(",") });
  const creationId = await postThreads(input.threadsUserId, input.accessToken, cp);
  return { creationId, needWait: true };
}

async function publishContainer(userId: string, token: string, creationId: string): Promise<string> {
  const params = new URLSearchParams({ access_token: token, creation_id: creationId });
  const res = await fetchWithTimeout(`${GRAPH}/${userId}/threads_publish`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`發布失敗 ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

export async function publishToThreads(input: PublishInput): Promise<{ postId: string }> {
  const media = resolveMedia(input);
  const { creationId, needWait } = await buildCreation(input, media);
  if (needWait) await waitForContainerReady(creationId, input.accessToken);
  const postId = await publishContainer(input.threadsUserId, input.accessToken, creationId);

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
