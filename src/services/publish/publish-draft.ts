import { getThreadsCredentials, updateDraftStatus } from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { normalizeDraftMedia, normalizeReplyMedia } from "@/lib/media";
import { replyDelayMinutes } from "@/services/publish/reply-timing";
import { env } from "@/lib/env";
import type { Draft } from "@/lib/types";

// 立即發布單篇草稿（手動「核准並發布」與「快速發文」共用，取代 compose/drafts-action 兩份重複流程）。
// 流程：設 publishing → 取憑證 → 發文 → 落 published（含延遲留言排程）；任一步失敗落 failed 並重拋，
// 由呼叫端決定回應（原始錯誤建議用 apiError 收斂，draft.error 已存供本人除錯）。
// 前置條件：呼叫端須已驗證 draft（含其 threads_account_id）歸屬於 ownerId。
export async function publishDraftNow(draft: Draft, ownerId: string): Promise<{ postId: string; deferReply: boolean }> {
  if (!draft.threads_account_id) throw new Error("草稿未綁定 Threads 帳號");
  await updateDraftStatus(draft.id, "publishing", {}, ownerId);
  try {
    const creds = await getThreadsCredentials(draft.threads_account_id, ownerId);
    if (!creds) throw new Error("找不到 Threads 帳號憑證");
    // all_in_main：留言文案併入主文、不另發留言（不走延遲留言流程）
    const allInMain = draft.post_mode === "all_in_main";
    // 有留言文字「或」留言媒體都算要發第 2 則串文（純媒體留言也要發出，不靜默丟棄）。
    const hasReply = (Boolean(draft.reply_text) || normalizeReplyMedia(draft).length > 0) && !allInMain;
    // 留言延遲：>0 表示主文先發、留言之後由 cron 補（防「秒留言」固定行為）
    const replyDelay = hasReply
      ? replyDelayMinutes(draft.id, env.replyDelayFloorMinutes, env.replyDelayJitterMinutes, draft.reply_delay_minutes)
      : 0;
    const deferReply = hasReply && replyDelay > 0;
    const { postId, replyFailed } = await publishToThreads({
      threadsUserId: creds.threadsUserId,
      accessToken: creds.accessToken,
      text: draft.main_text ?? "",
      media: normalizeDraftMedia(draft),
      replyText: draft.reply_text,
      replyMedia: normalizeReplyMedia(draft),
      postMode: draft.post_mode,
      deferReply
    });
    const nowMs = Date.now();
    const replyPatch = deferReply
      ? { reply_status: "pending" as const, reply_due_at: new Date(nowMs + replyDelay * 60000).toISOString() }
      : hasReply
        ? { reply_status: replyFailed ? ("failed" as const) : ("published" as const) }
        : {};
    await updateDraftStatus(draft.id, "published", {
      published_post_id: postId,
      published_at: new Date(nowMs).toISOString(),
      ...replyPatch
    }, ownerId);
    return { postId, deferReply };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateDraftStatus(draft.id, "failed", { error: msg }, ownerId);
    throw e;
  }
}
