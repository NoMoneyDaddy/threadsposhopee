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
  wasProductPublishedSince,
  isPublishPaused,
  getAccountCircuitUntil,
  tripAccountCircuit,
  clearAccountCircuit
} from "@/lib/store";
import { publishToThreads, publishReply, PublishUncertainError } from "@/services/threads/publish";
import { log } from "@/lib/logger";
import { normalizeDraftMedia } from "@/lib/media";
import { shardOf, circuitOpen, nextPacingSkipReason } from "@/services/publish/cadence";
import { replyDelayMinutes } from "@/services/publish/reply-timing";
import { sendAlert, sendUserAlert } from "@/lib/notify";

export interface PublishResult {
  considered: number;
  published: { id: string; postId: string }[];
  skipped: { id: string; reason: string }[];
  failed: { id: string; error: string }[];
  needsVerification?: { id: string; error: string }[]; // 發布不確定（可能已發出），待人工確認
  reclaimed: number;
  replies?: { published: number; failed: number }; // 延遲留言補發結果
  lockBusy?: boolean; // true 表示另一輪（cron 或手動）正在跑，本次未執行
  paused?: boolean; // true 表示全域發文暫停中，本次整批跳過
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
    // 釋放鎖失敗不該炸上層，但需可見：否則下一輪 cron 會卡 lockBusy 直到 TTL 過期難以察覺。
    await releasePublishLock(lockKey).catch((e) => log.warn("釋放發文鎖失敗", { lockKey, err: e }));
  }
}

async function runPublishQueueLocked(result: PublishResult, shard?: ShardOpts): Promise<PublishResult> {
  // 全域急停：暫停中整批跳過（含主文與延遲留言），不做任何外部發布動作。
  if (await isPublishPaused()) {
    result.paused = true;
    return result;
  }
  // 先回收上次中斷卡在 publishing 的草稿（標 failed 待人工重試）
  result.reclaimed = await reclaimStalePublishing();
  // 分片模式只處理本片帳號的草稿（同帳號穩定落同片）；未綁帳號者歸片 0，至少有人記錄略過
  const drafts = (await listApprovedDrafts()).filter((d) => inShard(d.threads_account_id, shard));
  result.considered = drafts.length;

  // 以 Threads 帳號為單位控制節奏；同一次執行內累積計數
  const startTime = Date.now();
  const publishedThisRun: Record<string, number> = {};
  // 連續失敗斷路器：記本輪每帳號失敗數；達上限後跳過該帳號其餘草稿（並只示警一次）。
  const failuresThisRun: Record<string, number> = {};
  const alertedBroken = new Set<string>();
  const failureLimit = env.publishAccountFailureLimit;
  // 跨輪斷路器冷卻：>0 才啟用「跨 cron 輪次」記憶。本輪快取各帳號冷卻狀態，避免重複查 app_state。
  const circuitCooldown = env.publishCircuitCooldownMinutes;
  const circuitUntilCache: Record<string, number | null> = {};
  const circuitCleared = new Set<string>(); // 本輪已解除冷卻的帳號（成功發文後），避免重複寫
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

    // 跨輪斷路器冷卻：上一輪觸發斷路器且仍在冷卻期 → 整批跳過該帳號（不每輪重新試探壞帳號）。
    if (failureLimit > 0 && circuitCooldown > 0) {
      if (!(accId in circuitUntilCache)) {
        circuitUntilCache[accId] = await getAccountCircuitUntil(accId).catch(() => null);
      }
      const until = circuitUntilCache[accId];
      if (until) {
        const mins = Math.ceil((until - Date.now()) / 60000);
        result.skipped.push({ id: draft.id, reason: `帳號連續失敗冷卻中（約 ${mins} 分後恢復）` });
        continue;
      }
    }

    const doneThisRun = publishedThisRun[accId] ?? 0;
    // 同步節奏守衛（斷路器→批次→每日上限含暖機→最小間隔含抖動）抽成純函式，集中且可單測。
    const pacingSkip = nextPacingSkipReason({
      failuresThisRun: failuresThisRun[accId] ?? 0,
      failureLimit,
      doneThisRun,
      batchPerRun: env.publishBatchPerRun,
      publishedLast24h: state.publishedLast24h,
      maxPerDay: env.publishMaxPerDay,
      warmupDays: env.accountWarmupDays,
      createdAt: state.createdAt,
      lastPublishedAt: state.lastPublishedAt,
      minGapMinutes: env.publishMinGapMinutes,
      gapJitterMinutes: env.publishGapJitterMinutes,
      accountId: accId,
      now: Date.now()
    });
    if (pacingSkip) {
      result.skipped.push({ id: draft.id, reason: pacingSkip });
      continue;
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
      // 帳號恢復正常發文 → 解除跨輪斷路器冷卻（本輪每帳號至多清一次）
      if (failureLimit > 0 && circuitCooldown > 0 && !circuitCleared.has(accId)) {
        circuitCleared.add(accId);
        circuitUntilCache[accId] = null;
        await clearAccountCircuit(accId).catch((e) => log.warn("解除帳號斷路器冷卻失敗", { accountId: accId, err: e }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 發布步驟不確定（可能已發出）→ needs_verification，不進 failed、不可被批次重試自動重發；
      // 其餘（建容器/等就緒等尚未發布）→ failed，可安全重試。
      if (e instanceof PublishUncertainError) {
        await updateDraftStatus(draft.id, "needs_verification", { error: msg });
        (result.needsVerification ??= []).push({ id: draft.id, error: msg });
        // 個人通知：發布不確定需人工確認 → 推給該草稿擁有者（已綁 Telegram 才送）。
        await sendUserAlert(
          draft.owner_id,
          `⚠️ 你的貼文「${draft.product_name ?? draft.id}」可能已發出但回應遺失，請到 Threads 確認後再決定重發或退回（草稿頁→待確認）。`
        ).catch(() => {});
      } else {
        await updateDraftStatus(draft.id, "failed", { error: msg });
        result.failed.push({ id: draft.id, error: msg });
      }
      // 累計本輪該帳號失敗（含不確定）；剛觸發斷路器時示警一次（提醒檢查 token/封號）
      failuresThisRun[accId] = (failuresThisRun[accId] ?? 0) + 1;
      if (circuitOpen(failuresThisRun[accId], failureLimit) && !alertedBroken.has(accId)) {
        alertedBroken.add(accId);
        // 跨輪冷卻：寫入冷卻到期，後續輪次整批跳過該帳號直到冷卻過或成功發文。
        if (circuitCooldown > 0) {
          circuitUntilCache[accId] = Date.now() + circuitCooldown * 60_000;
          await tripAccountCircuit(accId, circuitCooldown).catch((e) =>
            log.warn("寫入帳號斷路器冷卻失敗", { accountId: accId, err: e })
          );
        }
        const cd = circuitCooldown > 0 ? `，冷卻 ${circuitCooldown} 分` : "";
        await sendAlert(`⚠️ 帳號連續發文失敗 ${failuresThisRun[accId]} 次，已暫停該帳號${cd}。最後錯誤：${msg}`).catch(() => {});
      }
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
  await reclaimStaleReplies().catch((e) => log.warn("回收卡住留言失敗", { err: e }));
  let due;
  try {
    // 分片模式下，前 N 筆到期留言可能都屬其他片 → 本片過濾後變空而「餓死」。
    // 撈大一點再記憶體過濾（迴圈有 50s budget 保護，量大也安全）。
    const limit = shard ? 20 * shard.total : 20;
    due = (await listRepliesDue(limit)).filter((d) => inShard(d.threads_account_id, shard));
  } catch (e) {
    log.warn("撈待補留言失敗", { err: e });
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
      await markReplyFailed(d.id, ownerId, e instanceof Error ? e.message : String(e)).catch((me) =>
        log.warn("標記延遲留言失敗時又失敗（將由 reclaim 回收）", { ownerId, draftId: d.id, err: me })
      );
      // 個人通知：分潤連結留言（串文 2/2）沒補上＝影響轉換，推給該草稿擁有者到草稿頁重補。
      await sendUserAlert(ownerId, "💬 你有一則分潤連結留言補發失敗，請到草稿頁「重試補留言」。").catch(() => {});
      out.failed++;
    }
  }
  return out;
}
