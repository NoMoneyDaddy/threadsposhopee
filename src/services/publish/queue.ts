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
  releasePublishLock,
  listRepliesDue,
  claimReplyForPublish,
  reclaimStaleReplies,
  markReplyPublished,
  markReplyFailed,
  wasProductPublishedSince
} from "@/lib/store";
import { publishToThreads, publishReply } from "@/services/threads/publish";
import { normalizeDraftMedia } from "@/lib/media";
import { effectiveGapMinutes, shardOf, warmupDailyCap } from "@/services/publish/cadence";
import { replyDelayMinutes } from "@/services/publish/reply-timing";

export interface PublishResult {
  considered: number;
  published: { id: string; postId: string }[];
  skipped: { id: string; reason: string }[];
  failed: { id: string; error: string }[];
  reclaimed: number;
  replies?: { published: number; failed: number }; // 延遲留言補發結果
  lockBusy?: boolean; // true 表示另一輪（cron 或手動）正在跑，本次未執行
}

// 分片：多條 cron 並行發文時，各自只處理自己那片帳號（同帳號永遠落同片，防封節奏不被打散）。
// 不傳 = 單一全域模式（向後相容）。注意：全域與分片模式擇一使用，勿混用以免重複發文。
export interface ShardOpts {
  index: number;
  total: number;
}

export function inShard(accountId: string | null | undefined, shard?: ShardOpts): boolean {
  if (!shard) return true;
  // 未綁帳號的草稿歸片 0，確保仍有一片會記錄其「未綁定」略過（不會在每片都消失）
  if (!accountId) return shard.index === 0;
  return shardOf(accountId, shard.total) === shard.index;
}

export async function runPublishQueue(shard?: ShardOpts): Promise<PublishResult> {
  const result: PublishResult = { considered: 0, published: [], skipped: [], failed: [], reclaimed: 0 };
  // 分布式鎖：避免同一片（或全域）同時跑而各自繞過防封間隔。不同片用不同鎖鍵 → 可並行。
  const lockKey = shard ? `publish_queue_lock:s${shard.index}of${shard.total}` : "publish_queue_lock";
  const locked = await acquirePublishLock(5, lockKey);
  if (!locked) {
    result.lockBusy = true;
    return result;
  }
  try {
    return await runPublishQueueLocked(result, shard);
  } finally {
    await releasePublishLock(lockKey).catch(() => {});
  }
}

async function runPublishQueueLocked(result: PublishResult, shard?: ShardOpts): Promise<PublishResult> {
  // 先回收上次中斷卡在 publishing 的草稿（標 failed 待人工重試）
  result.reclaimed = await reclaimStalePublishing();
  // 分片模式只處理本片帳號的草稿（同帳號穩定落同片）；未綁帳號者歸片 0，至少有人記錄略過
  const drafts = (await listApprovedDrafts()).filter((d) => inShard(d.threads_account_id, shard));
  result.considered = drafts.length;

  // 以 Threads 帳號為單位控制節奏；同一次執行內累積計數
  const startTime = Date.now();
  const publishedThisRun: Record<string, number> = {};
  const stateCache: Record<
    string,
    { lastPublishedAt: string | null; publishedLast24h: number; accountStatus: string; createdAt: string | null }
  > = {};
  // 商品冷卻：記住本輪已發過的商品（跨帳號），避免同輪／DB 尚未可見時重複放行。
  const cooldownHours = env.productCooldownHours;
  const publishedProductsThisRun = new Set<string>();

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
    // 每日上限：新帳號暖機期內自動調降（前 N 天 1→max 線性遞增），降低新號被封風險。
    const dailyCap =
      env.accountWarmupDays > 0 && state.createdAt
        ? warmupDailyCap(
            env.publishMaxPerDay,
            env.accountWarmupDays,
            Math.floor((Date.now() - new Date(state.createdAt).getTime()) / 86_400_000)
          )
        : env.publishMaxPerDay;
    if (state.publishedLast24h + doneThisRun >= dailyCap) {
      result.skipped.push({ id: draft.id, reason: `已達每日上限（${dailyCap}）` });
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

    // 商品冷卻：同一分潤商品在冷卻期內已發過（本輪或近期 DB）就先不發，待冷卻過後下輪再發。
    // 注意：此為 best-effort 軟性防護（預設關閉）。全域模式（多數情境）在分布式鎖內無併發競態；
    // 分片並行模式下，不同片可能同窗各發一次同商品（無跨片原子保留），這是刻意的取捨——
    // 不為一個 default-off 的防刷軟限制引入跨片分布式保留的複雜度。
    const cleanUrl = draft.clean_product_url;
    if (cooldownHours > 0 && cleanUrl) {
      const sinceIso = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
      const onCooldown =
        publishedProductsThisRun.has(cleanUrl) ||
        (await wasProductPublishedSince(draft.owner_id ?? "", cleanUrl, sinceIso).catch(() => false));
      if (onCooldown) {
        result.skipped.push({ id: draft.id, reason: `商品冷卻中（${cooldownHours}h 內已發過）` });
        continue;
      }
    }

    // 原子鎖定：只有狀態仍是 approved 才搶得到；搶不到代表已被其他排程處理 → 跳過
    const locked = await updateDraftStatusAtomic(draft.id, "publishing", "approved");
    if (!locked) {
      result.skipped.push({ id: draft.id, reason: "草稿已被其他程序處理" });
      continue;
    }

    // 留言延遲：>0 表示主文先發、留言之後補（防「秒留言」固定行為）。逐則可覆寫。
    const replyDelay = draft.reply_text
      ? replyDelayMinutes(draft.id, env.replyDelayFloorMinutes, env.replyDelayJitterMinutes, draft.reply_delay_minutes)
      : 0;
    const deferReply = Boolean(draft.reply_text) && replyDelay > 0;

    try {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      let postId = "demo_" + nowMs;
      let replyFailedInline = false;

      if (!isDemoMode) {
        const creds = await getThreadsCredentials(accId, draft.owner_id ?? "");
        if (!creds) throw new Error("找不到 Threads 帳號憑證");
        const res = await publishToThreads({
          threadsUserId: creds.threadsUserId,
          accessToken: creds.accessToken,
          text: draft.main_text ?? "",
          media: normalizeDraftMedia(draft),
          replyText: draft.reply_text,
          deferReply
        });
        postId = res.postId;
        replyFailedInline = Boolean(res.replyFailed);
      }

      // 延遲留言：標 pending + 到期時間，交給下方的補留言 pass；
      // 立即留言：依實際成功與否落 published/failed（不要謊報 published）
      const replyPatch = deferReply
        ? { reply_status: "pending" as const, reply_due_at: new Date(nowMs + replyDelay * 60000).toISOString() }
        : draft.reply_text
          ? { reply_status: replyFailedInline ? ("failed" as const) : ("published" as const) }
          : {};
      await updateDraftStatus(draft.id, "published", { published_post_id: postId, published_at: nowIso, ...replyPatch });
      // 更新本地節奏狀態，讓同帳號的下一篇遵守間隔/上限
      publishedThisRun[accId] = doneThisRun + 1;
      state.lastPublishedAt = nowIso;
      if (cleanUrl) publishedProductsThisRun.add(cleanUrl); // 同輪同商品冷卻
      result.published.push({ id: draft.id, postId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await updateDraftStatus(draft.id, "failed", { error: msg });
      result.failed.push({ id: draft.id, error: msg });
    }
  }

  // 延遲留言補發：撈「到期待補」的，逐則補上 2/2 留言。整個 run 在分布式鎖內，無併發。
  result.replies = await publishDueReplies(startTime, shard);
  return result;
}

// 補發到期的延遲留言（串文 2/2）。回傳補發/失敗數。
async function publishDueReplies(startTime: number, shard?: ShardOpts): Promise<{ published: number; failed: number }> {
  const out = { published: 0, failed: 0 };
  if (isDemoMode) return out;
  // 先回收上次中斷卡在 publishing-reply 的留言（標 failed），再撈到期待補的
  await reclaimStaleReplies().catch((e) => console.warn("回收卡住留言失敗：", e instanceof Error ? e.message : e));
  let due;
  try {
    // 分片模式下，前 N 筆到期留言可能都屬其他片 → 本片過濾後變空而「餓死」。
    // 撈大一點再記憶體過濾（迴圈有 50s budget 保護，量大也安全）。
    const limit = shard ? 20 * shard.total : 20;
    due = (await listRepliesDue(limit)).filter((d) => inShard(d.threads_account_id, shard));
  } catch (e) {
    console.warn("撈待補留言失敗：", e instanceof Error ? e.message : e);
    return out;
  }
  for (const d of due) {
    if (Date.now() - startTime > 50000) break; // 守住 maxDuration，剩下的下輪再補
    const ownerId = d.owner_id;
    if (!ownerId) continue; // 無 owner（理論上不會發生）無法安全 owner 過濾，略過
    try {
      // 原子認領：搶不到代表已被處理/狀態變更 → 跳過，避免重複補發
      if (!(await claimReplyForPublish(d.id, ownerId))) continue;
      if (!d.threads_account_id || !d.published_post_id || !d.reply_text) {
        await markReplyFailed(d.id, ownerId, "缺帳號/主貼文/留言內容，無法補留言");
        out.failed++;
        continue;
      }
      const creds = await getThreadsCredentials(d.threads_account_id, ownerId);
      if (!creds) throw new Error("找不到 Threads 帳號憑證");
      const replyPostId = await publishReply(creds.threadsUserId, creds.accessToken, d.published_post_id, d.reply_text);
      await markReplyPublished(d.id, ownerId, replyPostId);
      out.published++;
    } catch (e) {
      await markReplyFailed(d.id, ownerId, e instanceof Error ? e.message : String(e)).catch(() => {});
      out.failed++;
    }
  }
  return out;
}
