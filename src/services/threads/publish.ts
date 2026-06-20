// Threads 發文：建立媒體容器 → 發布 → （可選）在自己貼文下留言放分潤連結。
// 支援單圖/單片、純文字，以及多媒體輪播（carousel）。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
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
  deferReply?: boolean; // true=只發主文、不立即留言（留言改由延遲 worker 補），回傳 replyDeferred
}

// 防禦性驗證：service 層入口不信任傳入的 media，過濾掉缺 url／型別錯誤的項。
function isValidMedia(m: unknown): m is DraftMedia {
  return (
    Boolean(m) &&
    typeof (m as DraftMedia).url === "string" &&
    (m as DraftMedia).url.length > 0 &&
    ((m as DraftMedia).type === "image" || (m as DraftMedia).type === "video")
  );
}

function resolveMedia(input: PublishInput): DraftMedia[] {
  if (input.media && input.media.length > 0) return input.media.filter(isValidMedia);
  if (input.mediaUrl && (input.mediaType === "image" || input.mediaType === "video")) {
    return [{ url: input.mediaUrl, type: input.mediaType }];
  }
  return [];
}

// 對單一媒體項設定容器參數（IMAGE/VIDEO + 對應 url）。
// SSRF 防護：media URL 可能來自爬蟲或使用者上傳，送往 Threads 前先過 assertSafePublicUrl。
function setMediaParams(params: URLSearchParams, item: DraftMedia): void {
  const safe = assertSafePublicUrl(item.url).href;
  if (item.type === "image") {
    params.set("media_type", "IMAGE");
    params.set("image_url", safe);
  } else {
    params.set("media_type", "VIDEO");
    params.set("video_url", safe);
  }
}

// Threads POST 遇 429（rate limited、請求未被處理）時退避重試，遵守 Retry-After。
// 只重試 429——5xx/網路錯誤可能其實已成功，重試會造成重複貼文，故不重試。
async function fetchThreadsPost(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let res = await fetchWithTimeout(url, init);
  for (let i = 1; i < attempts && res.status === 429; i++) {
    const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (i - 1);
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 16_000)));
    res = await fetchWithTimeout(url, init);
  }
  return res;
}

async function postThreads(userId: string, token: string, params: URLSearchParams): Promise<string> {
  params.set("access_token", token);
  const res = await fetchThreadsPost(`${GRAPH}/${userId}/threads`, { method: "POST", body: params });
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
    } else if (res.status >= 400 && res.status < 500) {
      // 4xx（授權/權限/參數錯誤）不會自己好，立即拋出真正原因，不要空轉到逾時
      throw new Error(`媒體狀態查詢失敗 ${res.status}: ${await res.text()}`);
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
  const res = await fetchThreadsPost(`${GRAPH}/${userId}/threads_publish`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`發布失敗 ${res.status}: ${await res.text()}`);
  return (await res.json()).id;
}

// 在指定主貼文下發一則留言（串文 2/2，放分潤連結），回傳留言貼文 id。
// 給「立即留言」與「延遲補留言 worker」共用。
export async function publishReply(
  threadsUserId: string,
  accessToken: string,
  postId: string,
  replyText: string
): Promise<string> {
  const replyParams = new URLSearchParams({
    access_token: accessToken,
    media_type: "TEXT",
    text: replyText,
    reply_to_id: postId
  });
  const replyUrl = assertSafePublicUrl(`${GRAPH}/${threadsUserId}/threads`).href;
  const c = await fetchThreadsPost(replyUrl, { method: "POST", body: replyParams });
  if (!c.ok) throw new Error(`留言容器建立失敗 ${c.status}: ${await c.text()}`);
  const replyCreation = (await c.json()).id;
  return publishContainer(threadsUserId, accessToken, replyCreation);
}

export async function publishToThreads(
  input: PublishInput
): Promise<{ postId: string; replyDeferred?: boolean; replyFailed?: boolean }> {
  const media = resolveMedia(input);
  const { creationId, needWait } = await buildCreation(input, media);
  if (needWait) await waitForContainerReady(creationId, input.accessToken);
  const postId = await publishContainer(input.threadsUserId, input.accessToken, creationId);

  if (!input.replyText) return { postId };

  // 延遲留言：只發主文，留言交給延遲 worker 之後補（防「秒留言」固定行為）
  if (input.deferReply) return { postId, replyDeferred: true };

  // 立即在貼文下留言放分潤連結（提高觸及，連結不放正文）。
  // 留言失敗不影響主貼文，但回傳 replyFailed 讓呼叫端把 reply_status 落成 failed（不要謊報 published）。
  try {
    await publishReply(input.threadsUserId, input.accessToken, postId, input.replyText);
  } catch (e) {
    console.warn(`貼文 ${postId} 的留言發布失敗:`, e instanceof Error ? e.message : e);
    return { postId, replyFailed: true };
  }
  return { postId };
}
