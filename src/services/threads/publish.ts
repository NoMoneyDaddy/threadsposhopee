// Threads 發文：建立媒體容器 → 發布 → （可選）在自己貼文下留言放分潤連結。
// 支援單圖/單片、純文字，以及多媒體輪播（carousel）。
import { fetchWithTimeout, fetchWithRetry } from "@/lib/http";
import { log } from "@/lib/logger";
import { assertSafePublicUrl } from "@/lib/url-guard";
import type { DraftMedia } from "@/lib/types";

const GRAPH = "https://graph.threads.net/v1.0";

// 發布步驟（threads_publish）失敗時拋此錯：該步驟一旦送出，貼文「可能已發出」，
// 呼叫端應標 needs_verification（人工確認）而非 failed（會被重發造成雙貼）。
export class PublishUncertainError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PublishUncertainError";
  }
}

interface PublishInput {
  threadsUserId: string;
  accessToken: string;
  text: string;
  media?: DraftMedia[]; // 0=純文字、1=單一媒體、>1=輪播
  // 向後相容：舊呼叫端仍可傳單一 media
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "none";
  replyText?: string | null; // 發成功後自動留言（放分潤連結）
  replyMedia?: DraftMedia[]; // 留言（2/2）要帶的媒體（通常 1 張圖）
  postMode?: "split" | "all_in_main" | null; // all_in_main＝影片+圖+連結全發主文、不另發留言
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

// Threads 輪播上限 20 項；超過 API 會整批拒。防禦性截斷（取前 20）讓多媒體仍能發出，
// 而非整篇失敗。註：輪播含多個影片時，逐項等就緒（每項最久 ~40s）可能逼近 serverless
// maxDuration；真逾時會留 publishing → reclaim 標 needs_verification（H2），人工確認後重試。
export const MAX_CAROUSEL_ITEMS = 20;

// 過濾無效項並截斷至輪播上限。
function clampMedia(items: DraftMedia[]): DraftMedia[] {
  const valid = items.filter(isValidMedia);
  if (valid.length > MAX_CAROUSEL_ITEMS) {
    log.warn("輪播項數超過 Threads 上限，截斷至前 20 項", { total: valid.length, max: MAX_CAROUSEL_ITEMS });
    return valid.slice(0, MAX_CAROUSEL_ITEMS);
  }
  return valid;
}

function resolveMedia(input: PublishInput): DraftMedia[] {
  if (input.media && input.media.length > 0) return clampMedia(input.media);
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
// 只重試 429——5xx/網路錯誤可能其實已成功，重試會造成重複貼文，故不重試（fetchWithRetry 的語意）。
// SSRF 防護收斂於此：所有外部 POST 在送出前統一過 assertSafePublicUrl。
async function fetchThreadsPost(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  const safe = assertSafePublicUrl(url).href;
  return fetchWithRetry(safe, init, 8000, attempts);
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
// replyToId 有值＝這是某主貼文下的留言（串文 2/2），reply_to_id 設在頂層容器（輪播設在母容器）。
async function buildCreation(
  userId: string,
  token: string,
  text: string,
  media: DraftMedia[],
  replyToId?: string
): Promise<{ creationId: string; needWait: boolean }> {
  // 純文字或單一媒體：單一容器（文案放這裡）
  if (media.length <= 1) {
    const params = new URLSearchParams({ text });
    if (media.length === 1) setMediaParams(params, media[0]);
    else params.set("media_type", "TEXT");
    if (replyToId) params.set("reply_to_id", replyToId);
    const creationId = await postThreads(userId, token, params);
    return { creationId, needWait: media[0]?.type === "video" };
  }

  // 輪播：先建各子項容器（is_carousel_item），影片子項需等就緒，再建輪播母容器（文案放母容器）
  const childIds: string[] = [];
  for (const item of media) {
    const p = new URLSearchParams({ is_carousel_item: "true" });
    setMediaParams(p, item);
    const childId = await postThreads(userId, token, p);
    if (item.type === "video") await waitForContainerReady(childId, token);
    childIds.push(childId);
  }
  const cp = new URLSearchParams({ media_type: "CAROUSEL", text, children: childIds.join(",") });
  if (replyToId) cp.set("reply_to_id", replyToId);
  const creationId = await postThreads(userId, token, cp);
  return { creationId, needWait: true };
}

async function publishContainer(userId: string, token: string, creationId: string): Promise<string> {
  const params = new URLSearchParams({ access_token: token, creation_id: creationId });
  // Threads 容器建立後偶有「最終一致性」延遲：剛建好就 publish，可能回 code 24 / subcode 4279009
  // 「資源不存在（媒體找不到）」。此錯誤代表容器尚未就緒、貼文「必定還沒發出」→ 短退避重試是安全的
  // （不會造成雙貼）。純文字/留言容器無 status 可輪詢（needWait=false），故在此用重試補上就緒等待。
  let lastErr = "發布失敗";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchThreadsPost(`${GRAPH}/${userId}/threads_publish`, { method: "POST", body: params });
    if (res.ok) {
      // 2xx 但回應缺 id：貼文「可能已發出」卻拿不到 id → 視為不確定（呼叫端標 needs_verification），
      // 不可當成功（會謊報 published 且無 postId 可補留言/去重），也不可當 failed（會被重發雙貼）。
      const id = (await res.json().catch(() => null))?.id;
      if (!id) throw new Error("發布回應缺少貼文 id（可能已發出）");
      return id;
    }
    const body = await res.text();
    lastErr = `發布失敗 ${res.status}: ${body}`;
    // 僅在「容器尚未就緒/找不到」才重試（必定未發出 → 安全）；其他錯誤立即拋出。
    const notReady = res.status === 400 && /"code":\s*24|4279009|does not exist/i.test(body);
    if (!notReady || attempt === 3) throw new Error(lastErr);
    await new Promise((r) => setTimeout(r, 3000)); // 等容器就緒再重試
  }
  throw new Error(lastErr);
}

// 在指定主貼文下發一則留言（串文 2/2，放分潤連結＋可選媒體），回傳留言貼文 id。
// 給「立即留言」與「延遲補留言 worker」共用。
export async function publishReply(
  threadsUserId: string,
  accessToken: string,
  postId: string,
  replyText: string,
  replyMedia: DraftMedia[] = []
): Promise<string> {
  const media = clampMedia(replyMedia);
  const { creationId, needWait } = await buildCreation(threadsUserId, accessToken, replyText, media, postId);
  if (needWait) await waitForContainerReady(creationId, accessToken);
  return publishContainer(threadsUserId, accessToken, creationId);
}

export async function publishToThreads(
  input: PublishInput
): Promise<{ postId: string; replyDeferred?: boolean; replyFailed?: boolean }> {
  const mainMedia = resolveMedia(input);
  const replyMedia = clampMedia(input.replyMedia ?? []);

  // 全部發主文：影片＋圖＋（留言文案內含的）分潤連結全部放主文，不另發留言。
  // 主文媒體 = 原主文媒體 ＋ 留言媒體合併；主文文案 = 正文＋留言文案。
  const allInMain = input.postMode === "all_in_main";
  const text = allInMain && input.replyText ? [input.text, input.replyText].filter(Boolean).join("\n\n") : input.text;
  const media = allInMain ? clampMedia([...mainMedia, ...replyMedia]) : mainMedia;

  // 建容器/等就緒：失敗代表「尚未發布」，可安全重試（沿用原錯誤 → 呼叫端標 failed）。
  const { creationId, needWait } = await buildCreation(input.threadsUserId, input.accessToken, text, media);
  if (needWait) await waitForContainerReady(creationId, input.accessToken);
  // 發布步驟：一旦送出 threads_publish 即「可能已發出」，失敗包成 PublishUncertainError，
  // 讓呼叫端標 needs_verification（人工確認）而非 failed，避免重發雙貼。
  let postId: string;
  try {
    postId = await publishContainer(input.threadsUserId, input.accessToken, creationId);
  } catch (e) {
    throw new PublishUncertainError(e);
  }

  // 全部發主文模式：留言內容已併入主文，不再發留言。
  // 無留言文字「且」無留言媒體才不發第 2 則（純媒體留言仍要發出）。
  if (allInMain || (!input.replyText && replyMedia.length === 0)) return { postId };

  // 延遲留言：只發主文，留言交給延遲 worker 之後補（防「秒留言」固定行為）
  if (input.deferReply) return { postId, replyDeferred: true };

  // 立即在貼文下留言放分潤連結（提高觸及，連結不放正文）＋可選留言媒體。
  // 留言失敗不影響主貼文，但回傳 replyFailed 讓呼叫端把 reply_status 落成 failed（不要謊報 published）。
  try {
    await publishReply(input.threadsUserId, input.accessToken, postId, input.replyText ?? "", replyMedia);
  } catch (e) {
    log.warn("留言發布失敗", { postId, err: e });
    return { postId, replyFailed: true };
  }
  return { postId };
}
