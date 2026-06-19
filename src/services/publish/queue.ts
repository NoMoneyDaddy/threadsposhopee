// 發文 worker：與爬取流程完全分開。挑出「已核准」的草稿，依防封節奏（間隔、每日上限、
// 每次批次）逐篇發到 Threads。由獨立的 /api/cron/publish 觸發。
import { env, isDemoMode } from "@/lib/env";
import {
  listApprovedDrafts,
  getAccountPublishState,
  getThreadsCredentials,
  updateDraftStatus,
  updateDraftStatusAtomic,
  reclaimStalePublishing,
  acquirePublishLock,
  releasePublishLock
} from "@/lib/store";
import { publishToThreads } from "@/services/threads/publish";
import { normalizeDraftMedia } from "@/lib/media";
import { effectiveGapMinutes } from "@/services/publish/cadence";

export interface PublishResult {
  considered: number;
  published: { id: string; postId: string }[];
  skipped: { id: string; reason: string }[];
  failed: { id: string; error: string }[];
  reclaimed: number;
  lockBusy?: boolean; // true 表示另一輪（cron 或手動）正在跑，本次未執行
}

export async function runPublishQueue(): Promise<PublishResult> {
  const result: PublishResult = { considered: 0, published: [], skipped: [], failed: [], reclaimed: 0 };
  // 分布式鎖：避免 cron 與手動觸發同時跑而各自繞過防封最小間隔。搶不到就直接讓出。
  const locked = await acquirePublishLock();
  if (!locked) {
    result.lockBusy = true;
    return result;
  }
  try {
    return await runPublishQueueLocked(result);
  } finally {
    await releasePublishLock().catch(() => {});
  }
}

async function runPublishQueueLocked(result: PublishResult): Promise<PublishResult> {
  // 先回收上次中斷卡在 publishing 的草稿（標 failed 待人工重試）
  result.reclaimed = await reclaimStalePublishing();
  const drafts = await listApprovedDrafts();
  result.considered = drafts.length;

  // 以 Threads 帳號為單位控制節奏；同一次執行內累積計數
  const startTime = Date.now();
  const publishedThisRun: Record<string, number> = {};
  const stateCache: Record<string, { lastPublishedAt: string | null; publishedLast24h: number; accountStatus: string }> = {};

  for (const draft of drafts) {
    // 接近 maxDuration(60s) 上限就停手，避免草稿卡在 publishing 狀態，留待下次排程
    if (Date.now() - startTime > 50000) break;

    const accId = draft.threads_account_id;
    if (!accId) {
      result.skipped.push({ id: draft.id, reason: "未綁定 Threads 帳號" });
      continue;
    }

    // 取帳號狀態若失敗（暫時性 DB 問題、帳號不存在）→ 跳過該草稿，不讓整個佇列崩潰
    try {
      if (!stateCache[accId]) stateCache[accId] = await getAccountPublishState(accId);
    } catch (e) {
      result.skipped.push({ id: draft.id, reason: `取帳號狀態失敗：${e instanceof Error ? e.message : e}` });
      continue;
    }
    const state = stateCache[accId];

    // 帳號非 active（如 token 展期失敗被標 error）→ 跳過，避免發文時崩潰
    if (state.accountStatus !== "active") {
      result.skipped.push({ id: draft.id, reason: `帳號狀態為 ${state.accountStatus}` });
      continue;
    }

    const doneThisRun = publishedThisRun[accId] ?? 0;

    if (doneThisRun >= env.publishBatchPerRun) {
      result.skipped.push({ id: draft.id, reason: "本次批次已達上限" });
      continue;
    }
    if (state.publishedLast24h + doneThisRun >= env.publishMaxPerDay) {
      result.skipped.push({ id: draft.id, reason: "已達每日上限" });
      continue;
    }
    if (state.lastPublishedAt) {
      const gapMin = (Date.now() - new Date(state.lastPublishedAt).getTime()) / 60000;
      // 有效間隔 = 保底 + 隨機抖動（以帳號+上次發文時間為穩定 seed，與前端 ETA 估算一致）
      const required = effectiveGapMinutes(
        env.publishMinGapMinutes,
        env.publishGapJitterMinutes,
        `${accId}:${new Date(state.lastPublishedAt).getTime()}`
      );
      if (gapMin < required) {
        result.skipped.push({ id: draft.id, reason: `未達最小間隔（${Math.round(gapMin)}/${required} 分）` });
        continue;
      }
    }

    // 原子鎖定：只有狀態仍是 approved 才搶得到；搶不到代表已被其他排程處理 → 跳過
    const locked = await updateDraftStatusAtomic(draft.id, "publishing", "approved");
    if (!locked) {
      result.skipped.push({ id: draft.id, reason: "草稿已被其他程序處理" });
      continue;
    }

    try {
      const nowIso = new Date().toISOString();
      let postId = "demo_" + Date.now();

      if (!isDemoMode) {
        const creds = await getThreadsCredentials(accId);
        if (!creds) throw new Error("找不到 Threads 帳號憑證");
        const res = await publishToThreads({
          threadsUserId: creds.threadsUserId,
          accessToken: creds.accessToken,
          text: draft.main_text ?? "",
          media: normalizeDraftMedia(draft),
          replyText: draft.reply_text
        });
        postId = res.postId;
      }

      await updateDraftStatus(draft.id, "published", { published_post_id: postId, published_at: nowIso });
      // 更新本地節奏狀態，讓同帳號的下一篇遵守間隔/上限
      publishedThisRun[accId] = doneThisRun + 1;
      state.lastPublishedAt = nowIso;
      result.published.push({ id: draft.id, postId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateDraftStatus(draft.id, "failed", { error: msg });
      result.failed.push({ id: draft.id, error: msg });
    }
  }

  return result;
}
