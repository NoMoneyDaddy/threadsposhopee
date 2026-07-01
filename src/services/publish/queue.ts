// 發文 worker：與爬取流程完全分開。挑出「已核准」的草稿，依防封節奏（間隔、每日上限、
// 每次批次）逐篇發到 Threads。由獨立的 /api/cron/publish 觸發。
import { env, isDemoMode } from "@/lib/env";
import {
  listApprovedDrafts,
  listApprovedDraftsForShard,
  getAccountPublishState,
  getPublishPrefs,
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
  advanceThreadSegment,
  wasProductPublishedSince,
  isPublishPaused,
  getAccountCircuitUntil,
  tripAccountCircuit,
  clearAccountCircuit,
  getContributionScore,
  getSponsorRewardMode,
  countPublishedByAccount,
  getThreadsUserIdsByAccountIds
} from "@/lib/store";
import { canOwnLink, contributionAdjustedPerPosts } from "@/lib/contribution";
import { publishToThreads, publishReply, PublishUncertainError } from "@/services/threads/publish";
import { getOwnerUserId } from "@/lib/auth";
import {
  getSponsorConfig,
  appendSponsorRecord,
  getSponsorStatsMap,
  statsOptOut,
  statsPenaltyFactor,
  incrementSponsorTotal,
  getOwnerSponsorDebt,
  adjustOwnerSponsorDebt,
  incrementSponsorRedist,
  shouldSponsor,
  swapAffiliateLink,
  taipeiParts,
  type SponsorStats
} from "@/lib/sponsor";
import { isRiskySponsorContent } from "@/services/publish/sponsor-content";
import { shouldSponsorCumulative, ownLinkThisSlot, sponsorWithDebt, shouldAccrueOptOutDebt } from "@/services/publish/sponsor-quota";
import { resolveSponsorOwnerCreds, buildSponsorLinkForAccount, cleanProductUrlFromDraft } from "@/services/sponsor/link";
import { getProductInfo } from "@/services/shopee/affiliate";
import { parseShopeeIds } from "@/services/shopee/expand";
import { log } from "@/lib/logger";
import { normalizeDraftMedia, normalizeReplyMedia } from "@/lib/media";
import { shardOf, circuitOpen, nextPacingSkipReason, reachAdjustedPacing } from "@/services/publish/cadence";
import { getReachDropCached } from "@/services/threads/engagement";
import { replyDelayMinutes } from "@/services/publish/reply-timing";
import { effectiveChain, chainStepAt, hasThreadChain } from "@/services/publish/thread-chain";
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
  const lockToken = await acquirePublishLock(5, lockKey);
  if (!lockToken) {
    result.lockBusy = true;
    return result;
  }
  try {
    return await runPublishQueueLocked(result, shard);
  } finally {
    // 釋放鎖失敗不該炸上層，但需可見：否則下一輪 cron 會卡 lockBusy 直到 TTL 過期難以察覺。
    // 帶 token 釋放：若本輪超時、鎖已被他輪搶走則不誤放（見 releasePublishLock）。
    await releasePublishLock(lockKey, lockToken).catch((e) => log.warn("釋放發文鎖失敗", { lockKey, err: e }));
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
  // 跨租戶批次回收：單輪回收量異常偏高多半代表系統性故障（非個別中斷），告警以利及早察覺。
  if (result.reclaimed >= 10) {
    await sendAlert(`⚠️ 發文回收量異常：單輪有 ${result.reclaimed} 篇卡住的 publishing 被回收，請檢查發文流程是否系統性故障。`).catch(
      () => {}
    );
  }
  // 分片模式只處理本片帳號的草稿（同帳號穩定落同片）；未綁帳號者歸片 0，至少有人記錄略過。
  // 分片時用 shard-aware 分頁抓取，避免「全域 limit 先截斷再記憶體分片」造成某些 shard 拿到 0 筆（starvation）。
  const drafts = shard
    ? await listApprovedDraftsForShard((accId) => inShard(accId, shard))
    : await listApprovedDrafts();
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
  // 每位使用者自訂發文節奏（min gap／每日上限）本輪快取（依 owner）。
  const pacingPrefsCache: Record<string, { slots: string[]; minGapMinutes: number; maxPerDay: number; replyDelayMinMinutes: number; replyDelayJitterMinutes: number }> = {};
  // 觸及自動調速：本輪快取各 owner 是否「近期觸及驟降」（detectReachDrop），是則放慢其節奏。
  const reachSlowByOwner: Record<string, boolean> = {};
  // 商品冷卻：記住本輪已發過的商品（跨帳號），避免同輪／DB 尚未可見時重複放行。
  const cooldownHours = env.productCooldownHours;
  const publishedProductsThisRun = new Set<string>();
  // 本輪 DB 冷卻查詢結果快取（owner|url → 是否冷卻中），避免同商品多草稿時每篇都打一次 DB（N+1）。
  const productCooldownCache = new Map<string, boolean>();

  // 贊助文（比例制 B+A）：把非 owner 帳號「自己的」待發草稿連結就地換成平台連結（DB 原文不動＝發後還原）。
  // 配額依該帳號「當日實際自發篇數」計算（sponsorQuota），低頻者不被強抽；不再注入管理員內容、不再限冷門時段。
  const sponsorCfg = await getSponsorConfig();
  const sponsorTaipei = taipeiParts();
  // 台北當日零點 ISO（Asia/Taipei 恆為 +08:00，無 DST）：算「今天」已發篇數的下界。
  const sponsorTodaySinceIso = new Date(`${sponsorTaipei.date}T00:00:00+08:00`).toISOString();
  const sponsorOwnerId = sponsorCfg.enabled && !isDemoMode ? await getOwnerUserId().catch(() => null) : null;
  // R2-D：帳號持久贊助狀態（黑名單/罰則/禁用/自選/累積數）改綁穩定的 threads_user_id 並存專屬表。
  // 整輪一次批次載入本批草稿涉及的所有帳號狀態（accId→tuid 映射 + tuid→stats），供決策免逐篇查 DB。
  // 載入失敗＝保守：accToTuid 留空 → tuid 解析不到 → 本輪略過贊助（不誤抽、不崩潰）。
  let accToTuid: Record<string, string> = {};
  let sponsorStatsByTuid = new Map<string, SponsorStats>();
  if (sponsorCfg.enabled && !isDemoMode) {
    const sponsorAccIds = Array.from(new Set(drafts.map((d) => d.threads_account_id).filter((x): x is string => Boolean(x))));
    try {
      accToTuid = await getThreadsUserIdsByAccountIds(sponsorAccIds);
      sponsorStatsByTuid = await getSponsorStatsMap(Object.values(accToTuid));
    } catch (e) {
      log.warn("載入贊助帳號狀態失敗，本輪略過贊助文", { err: e });
      accToTuid = {};
    }
  }
  // 累積比例：依帳號「累積發布數／累積贊助數」自我校正（取代每日門檻，補掉每天壓門檻的漏洞）。
  const sponsorPublishedCache: Record<string, number> = {}; // accId -> 累積已發布篇數（-1＝算不出，保守不抽）
  const sponsorTotalCache: Record<string, number> = {}; // accId -> 累積已發贊助文數（seed 自 stats，成功後遞增）
  // 自賺資格＋自己的金鑰資源（依 owner 快取）：超額 slot 用貢獻者自己的分潤連結。
  const sponsorOwnLinkCache: Record<string, { eligible: boolean; creds: Awaited<ReturnType<typeof resolveSponsorOwnerCreds>> | null }> = {};
  // 依 owner 快取貢獻分數＋回饋模式（免贊助豁免＋依貢獻分級抽成用），避免每篇重查。
  const sponsorRewardCache: Record<string, { score: number; mode: "exempt" | "own_link" }> = {};
  // ownerId -> 目前欠抽（永久完全禁用帳號轉嫁來的份額，由其他帳號代抽補還）；accId -> 已轉出份數。
  const ownerDebtCache: Record<string, number> = {};
  const sponsorRedistCache: Record<string, number> = {};
  // backstop：owner 欠抽堆到此上限（代表其他帳號沒在還）→ 永久完全不抽的帳號本身恢復被抽以服務欠抽。
  const OWNER_DEBT_CAP = 5;
  const selfServiceNotified = new Set<string>(); // 已通知過「永久禁用帳號恢復被抽」的 owner（本輪一次）
  // owner 金鑰資源整輪取一次（金鑰/affiliate_id/自訂 subId）；商品連結改用「每篇貼文自己的」就地改寫。
  const sponsorOwnerCreds =
    sponsorCfg.enabled && !isDemoMode && sponsorOwnerId ? await resolveSponsorOwnerCreds(sponsorOwnerId).catch(() => null) : null;

  // 觸及自動調速：本輪「先並行」預抓各 owner 的觸及驟降訊號（getReachDropCached 為布林快取、含負向，
  // 30 分 TTL → 不會每輪重打逐篇 insights API），避免在發文主迴圈內逐一序列 await 吃掉 50s 預算。
  // factor=1（關閉）則完全不查；查詢失敗/樣本不足視為無驟降（getReachDropCached 內已降級）。
  if (env.publishReachSlowdownFactor > 1) {
    const owners = Array.from(new Set(drafts.map((d) => d.owner_id).filter((o): o is string => Boolean(o))));
    await Promise.all(
      owners.map(async (o) => {
        const hasSignal = await getReachDropCached(o).catch(() => false);
        reachSlowByOwner[o] = hasSignal;
        if (hasSignal) log.info("觸及偏低，自動放慢發文節奏", { ownerId: o, factor: env.publishReachSlowdownFactor });
      })
    );
  }

  for (const draft of drafts) {
    // 接近 maxDuration(60s) 上限就停手，避免草稿卡在 publishing 狀態，留待下次排程
    if (Date.now() - startTime > 50000) break;

    const accId = draft.threads_account_id;
    // 贊助文計數以穩定的 threads_user_id 為鍵（R2-D）：整輪已批次載入映射，null＝查不到（略過贊助）。
    const sponsorTuid = accId ? accToTuid[accId] ?? null : null;
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
    // 每位使用者自訂節奏（min gap／每日上限）：依草稿 owner 查一次並快取本輪；未設沿用 env。
    const ownerKey = draft.owner_id ?? "";
    if (!(ownerKey in pacingPrefsCache)) {
      pacingPrefsCache[ownerKey] = await getPublishPrefs(ownerKey).catch(() => ({
        slots: [],
        minGapMinutes: env.publishMinGapMinutes,
        maxPerDay: env.publishMaxPerDay,
        replyDelayMinMinutes: env.replyDelayFloorMinutes,
        replyDelayJitterMinutes: env.replyDelayJitterMinutes
      }));
    }
    const pp = pacingPrefsCache[ownerKey];
    // 觸及自動調速：用本輪預抓的 owner 驟降訊號放慢節奏（間隔×／每日上限÷）。安全方向（只會更慢）。
    const eff = reachAdjustedPacing(
      { minGapMinutes: pp.minGapMinutes, maxPerDay: pp.maxPerDay },
      reachSlowByOwner[ownerKey] ?? false,
      env.publishReachSlowdownFactor
    );
    // 同步節奏守衛（斷路器→批次→每日上限含暖機→最小間隔含抖動）抽成純函式，集中且可單測。
    const pacingSkip = nextPacingSkipReason({
      failuresThisRun: failuresThisRun[accId] ?? 0,
      failureLimit,
      doneThisRun,
      batchPerRun: env.publishBatchPerRun,
      publishedLast24h: state.publishedLast24h,
      maxPerDay: eff.maxPerDay,
      warmupDays: env.accountWarmupDays,
      createdAt: state.createdAt,
      lastPublishedAt: state.lastPublishedAt,
      minGapMinutes: eff.minGapMinutes,
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
      const cacheKey = `${draft.owner_id ?? ""}|${cleanUrl}`;
      let dbCooldown = productCooldownCache.get(cacheKey);
      if (dbCooldown === undefined) {
        const sinceIso = new Date(Date.now() - cooldownHours * 3600_000).toISOString();
        dbCooldown = await wasProductPublishedSince(draft.owner_id ?? "", cleanUrl, sinceIso).catch(() => false);
        productCooldownCache.set(cacheKey, dbCooldown);
      }
      const onCooldown = publishedProductsThisRun.has(cleanUrl) || dbCooldown;
      if (onCooldown) {
        result.skipped.push({ id: draft.id, reason: `商品冷卻中（${cooldownHours}h 內已發過）` });
        continue;
      }
    }

    // 原子鎖定：只有狀態仍是 approved 才搶得到；搶不到代表已被其他排程處理 → 跳過
    const locked = await updateDraftStatusAtomic(draft.id, "publishing", "approved", {}, draft.owner_id ?? undefined);
    if (!locked) {
      result.skipped.push({ id: draft.id, reason: "草稿已被其他程序處理" });
      continue;
    }

    // all_in_main：影片+圖+連結全發主文、不另發留言（留言文案併入主文，不走延遲留言流程）。
    const allInMain = draft.post_mode === "all_in_main";
    // 主文之後要補發的段落（多段串文 thread_chain，或向後相容的單則 reply_*）。
    const chain = allInMain ? [] : effectiveChain(draft);
    const hasReply = chain.length > 0;
    // 留言延遲：>0 表示主文先發、留言之後補（防「秒留言」固定行為）。逐則可覆寫。
    const replyDelay = hasReply
      ? replyDelayMinutes(draft.id, pp.replyDelayMinMinutes, pp.replyDelayJitterMinutes, draft.reply_delay_minutes)
      : 0;
    // 多段串文一律交給 worker 依序補（避免一次爆發＋需要游標進度）；單則沿用「delay 0 即時補」捷徑。
    const deferReply = hasReply && (hasThreadChain(draft) || replyDelay > 0);

    // 贊助文判定：啟用＋非 owner 帳號＋冷門時段＋今天尚未做過 → 就地換連結（DB 原文不動）。
    let sponsorLinkUsed: string | null = null;
    let sponsorOwnLinkUsed = false; // 此篇是否用「貢獻者自己的」連結（超額 slot 自賺）
    let sponsorFromDebt = false; // 本篇是否為「代其他帳號補還」的平台贊助（成功後遞減 owner 欠抽）
    let accrueOptOutDebt = false; // 本篇（永久完全禁用帳號）成功後是否把應抽份額轉為 owner 欠抽
    let selfServicedThisPost = false; // 本篇是否為「永久禁用帳號因欠抽堆積而恢復被抽（backstop）」
    let pubMainText = draft.main_text ?? "";
    let pubReplyText = draft.reply_text;
    // AI 部落客（source_agent_id）的貼文一律「就是部落客」：不被選為贊助文、不注入任何分潤連結。
    if (sponsorCfg.enabled && !isDemoMode && !draft.source_agent_id && sponsorTuid) {
      const stats = sponsorStatsByTuid.get(sponsorTuid);
      const isOwnerAccount = Boolean(sponsorOwnerId) && draft.owner_id === sponsorOwnerId;
      // 臨時/永久禁用贊助文（活動檔期/商業合作，到期自動恢復）：mode=off→整篇略過；mode=half→減半抽成。
      const optOut = statsOptOut(stats);
      const blocked = Boolean(stats?.blocked); // 管理員黑名單（綁 threads_user_id，刪帳號重加無法規避）
      // 累積贊助/轉出數 seed 自批次 stats（本輪快取以 accId 為鍵、1:1，成功後遞增）。
      if (!(accId in sponsorTotalCache)) sponsorTotalCache[accId] = stats?.sponsoredCount ?? 0;
      if (!(accId in sponsorRedistCache)) sponsorRedistCache[accId] = stats?.redistCount ?? 0;
      // 依 owner 取貢獻分數＋回饋模式（非 owner 帳號才需要）：供「免贊助豁免」與「依貢獻分級抽成」。
      if (draft.owner_id && !isOwnerAccount && !(draft.owner_id in sponsorRewardCache)) {
        const oid = draft.owner_id;
        const [score, mode] = await Promise.all([
          getContributionScore(oid).catch(() => 0),
          getSponsorRewardMode(oid).catch(() => "exempt" as const)
        ]);
        sponsorRewardCache[oid] = { score, mode };
      }
      const reward = draft.owner_id ? sponsorRewardCache[draft.owner_id] : undefined;
      // 略過贊助的情況：owner 帳號、臨時禁用、管理員黑名單、或內容命中風險關鍵字（不把平台連結放上去，
      // 避免違規內容拖累平台分潤帳號被檢舉）。其餘一律套用（貢獻越高抽越少，平台保底永不歸零）。
      const riskyContent = isRiskySponsorContent(draft.main_text, draft.reply_text);
      // mode=off（完全禁用）才整篇略過；half（減半）仍套用、只是抽成減半（見 effectivePerPosts）。
      const fullyOptedOut = optOut?.mode === "off";
      // 永久完全不抽：不換連結，但把「應抽份額」轉為 owner 欠抽，由其他帳號代抽補還（配套：平台不被永久搭便車）。
      const permanentOff = Boolean(optOut?.permanent) && optOut?.mode === "off";
      // backstop：欠抽堆到上限（其他帳號沒在還，或自己與其他帳號都低頻/不發）→ 該帳號本身恢復被抽以服務欠抽，
      // opt-out 不再被無條件尊重，確保平台一定收得到（避免永久搭便車）。
      let permanentOffSelfService = false;
      if (permanentOff && draft.owner_id) {
        if (!(draft.owner_id in ownerDebtCache)) {
          ownerDebtCache[draft.owner_id] = await getOwnerSponsorDebt(draft.owner_id).catch(() => 0);
        }
        if ((ownerDebtCache[draft.owner_id] ?? 0) >= OWNER_DEBT_CAP) permanentOffSelfService = true;
      }
      if (permanentOff && !permanentOffSelfService && !isOwnerAccount && !blocked && draft.owner_id) {
        if (!(accId in sponsorPublishedCache)) {
          sponsorPublishedCache[accId] = await countPublishedByAccount(accId, draft.owner_id).catch(() => -1);
        }
        const baseP = contributionAdjustedPerPosts(sponsorCfg.perPosts, reward?.score ?? 0);
        if (sponsorPublishedCache[accId] >= 0 && shouldAccrueOptOutDebt(sponsorPublishedCache[accId], sponsorRedistCache[accId], baseP)) {
          accrueOptOutDebt = true; // 成功發布後把這一篇的應抽份額轉為 owner 欠抽
        }
      } else if (!isOwnerAccount && (!fullyOptedOut || permanentOffSelfService) && !blocked && !riskyContent) {
        // 累積比例：依帳號「累積發布數／累積贊助數」自我校正，長期維持約 1/perPosts；
        // 每天只發少量、天天壓門檻的人，累積到 perPosts 篇一樣會被抽（補掉每日門檻漏洞）。貢獻越高 perPosts 越大。
        if (!(accId in sponsorPublishedCache)) {
          sponsorPublishedCache[accId] = draft.owner_id
            ? await countPublishedByAccount(accId, draft.owner_id).catch((e: unknown) => {
                // 算不出累積發文數 → 保守降級為 -1（本篇不抽），不靜默吞錯。
                log.warn("計算累積發文數失敗，本篇略過贊助配額", { accId, err: e });
                return -1;
              })
            : -1;
        }
        // 基礎（依貢獻分級）→ 違規加重抽成（perPosts 除以 factor，抽更多）→ half 禁用模式（perPosts ×2，抽一半）。
        // 累積贊助數（sponsorTotalCache）與罰則倍數皆已由批次 stats seed，無需逐篇查 DB。
        const baserPerPosts = contributionAdjustedPerPosts(sponsorCfg.perPosts, reward?.score ?? 0);
        const penaltyFactor = statsPenaltyFactor(stats) || 1;
        const halfMult = optOut?.mode === "half" ? 2 : 1;
        const effectivePerPosts = Math.max(1, Math.round((baserPerPosts / penaltyFactor) * halfMult));
        // owner 欠抽（其他帳號永久禁用轉來的份額）：自身沒到比例時，可代抽補還。
        if (draft.owner_id && !(draft.owner_id in ownerDebtCache)) {
          ownerDebtCache[draft.owner_id] = await getOwnerSponsorDebt(draft.owner_id).catch(() => 0);
        }
        const ownerDebt = draft.owner_id ? (ownerDebtCache[draft.owner_id] ?? 0) : 0;
        const decision =
          sponsorPublishedCache[accId] >= 0
            ? sponsorWithDebt(sponsorPublishedCache[accId], sponsorTotalCache[accId], effectivePerPosts, ownerDebt)
            : { sponsor: false, fromDebt: false };
        const cumulativeAllows = decision.sponsor;
        const pick = stats?.pick ?? null;
        if (
          shouldSponsor({
            enabled: sponsorCfg.enabled,
            isOwnerAccount,
            hour: sponsorTaipei.hour,
            alreadyDoneToday: !cumulativeAllows,
            thisDraftId: draft.id,
            pickDraftId: pick?.draftId ?? null,
            pickHour: pick?.hour ?? null
          })
        ) {
          // 就地改寫：取「該篇貼文自己的」商品連結。平台/自賺分配以累積贊助序號交錯
          //（ownLinkThisSlot：偶數序號留平台＝保底不歸零，奇數序號給自賺資格貢獻者），無商品連結則略過。
          const useOwnSlot = ownLinkThisSlot(sponsorTotalCache[accId]);
          const draftCleanUrl = await cleanProductUrlFromDraft(draft).catch(() => null);
          let link: string | null = null;
          let useOwn = false;
          if (draftCleanUrl) {
            if (useOwnSlot && draft.owner_id && reward) {
              const oid = draft.owner_id;
              if (!(oid in sponsorOwnLinkCache)) {
                const eligible = reward.mode === "own_link" && canOwnLink(reward.score);
                const creds = eligible ? await resolveSponsorOwnerCreds(oid).catch(() => null) : null;
                sponsorOwnLinkCache[oid] = { eligible, creds };
              }
              const own = sponsorOwnLinkCache[oid];
              if (own.eligible && own.creds) {
                const ownLink = await buildSponsorLinkForAccount({ cleanUrl: draftCleanUrl, ...own.creds }, accId, sponsorCfg.subIds).catch(() => null);
                if (ownLink) {
                  link = ownLink;
                  useOwn = true;
                }
              }
            }
            // 非自賺：用 owner 金鑰把該篇商品重產成 owner 分潤連結，套用 owner 設定的贊助 sub_id。
            if (!useOwn && sponsorOwnerCreds) {
              const perAcct = await buildSponsorLinkForAccount({ cleanUrl: draftCleanUrl, ...sponsorOwnerCreds }, accId, sponsorCfg.subIds).catch(() => null);
              if (perAcct) link = perAcct;
            }
          }
          if (link) {
            // 只在確實命中原商品連結、真的替換掉時才算贊助；未命中則放棄本篇（不硬接連結）。
            const swappedMain = swapAffiliateLink(draft.main_text, draft.shopee_short_link, link);
            const swappedReply = draft.reply_text ? swapAffiliateLink(draft.reply_text, draft.shopee_short_link, link) : draft.reply_text;
            const changed = swappedMain !== (draft.main_text ?? "") || swappedReply !== (draft.reply_text ?? null);
            if (changed) {
              // 就地替換連結，其餘文案不動（不在貼文附加任何揭露文字）。
              pubMainText = swappedMain;
              pubReplyText = swappedReply;
              sponsorLinkUsed = link;
              sponsorOwnLinkUsed = useOwn;
              // 代抽補還：他帳號代抽（fromDebt），或 backstop 自我服務——兩者都用平台連結償還 owner 欠抽，
              // 成功後遞減欠抽；否則自我服務時欠抽永遠清不掉、帳號會被永久抽（Gemini 審查指出）。
              sponsorFromDebt = (decision.fromDebt || permanentOffSelfService) && !useOwn;
              selfServicedThisPost = permanentOffSelfService; // 永久禁用帳號因欠抽堆積而恢復被抽（backstop）
            }
          }
        }
      }
    }

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
          text: pubMainText,
          media: normalizeDraftMedia(draft),
          replyText: pubReplyText,
          replyMedia: normalizeReplyMedia(draft),
          postMode: draft.post_mode,
          deferReply
        });
        postId = res.postId;
        replyFailedInline = Boolean(res.replyFailed);
      }

      // 本帳號累積發布數 +1（累積比例分母）：同輪後續同帳號草稿據此遞增，比例隨實際發文量成長。
      if (accId in sponsorPublishedCache && sponsorPublishedCache[accId] >= 0) sponsorPublishedCache[accId] += 1;

      // 贊助文發布成功 → 累積贊助數 +1（持久化＋本輪快取），並追加紀錄供驗證；DB 草稿原文未動＝自動還原。
      if (sponsorLinkUsed) {
        // 原子累加（DB 為準），並以回傳新值回寫本輪快取；失敗只記 log（偏差方向為少抽、對使用者無害）。
        const newTotal = sponsorTuid
          ? await incrementSponsorTotal(sponsorTuid).catch((e) => {
              log.warn("累加贊助累積數失敗", { accId, err: e });
              return null;
            })
          : null;
        if (newTotal !== null && accId in sponsorTotalCache) sponsorTotalCache[accId] = newTotal;
        // 分潤率追蹤（R2-D）：快照此篇商品「當下」的蝦皮分潤率（隨時間變動）。best-effort、失敗不影響發文；
        // 只對平台贊助（非自賺）用 owner 金鑰查一次。
        let commissionRate: string | null = null;
        if (!sponsorOwnLinkUsed && sponsorOwnerCreds?.ownerCreds) {
          try {
            const cleanUrl = await cleanProductUrlFromDraft(draft);
            const ids = cleanUrl ? parseShopeeIds(cleanUrl) : null;
            if (ids) {
              const info = await getProductInfo(sponsorOwnerCreds.ownerCreds.appId, sponsorOwnerCreds.ownerCreds.secret, ids.shopId, ids.itemId);
              commissionRate = info?.commissionRate != null ? String(info.commissionRate) : null;
            }
          } catch (e) {
            log.warn("查詢分潤率失敗（不影響發文）", { accId, err: e });
          }
        }
        await appendSponsorRecord(accId, sponsorTaipei.date, {
          postId,
          link: sponsorLinkUsed,
          ownerId: draft.owner_id ?? "",
          at: nowIso,
          ownLink: sponsorOwnLinkUsed || undefined, // 自賺連結：驗證/裁罰時略過（非平台分潤）
          commissionRate // 分潤率快照（字串小數，如 "0.05"）；查不到為 null
        }).catch((e) => log.warn("寫入贊助文紀錄失敗", { accId, err: e }));
        // 主動通知使用者「你這篇被作為贊助文」，不再讓人只能事後自己回工作台發現（自賺篇不通知）。
        if (!sponsorOwnLinkUsed && draft.owner_id) {
          await sendUserAlert(
            draft.owner_id,
            "🔗 你剛發布的一篇貼文已被作為平台贊助文（連結替換為平台分潤連結，其餘內容不變）。可到「我的贊助文」頁（/sponsored-posts）查看完整紀錄。",
            "sponsor_used"
          ).catch(() => {});
        }
        // 代其他帳號補還：本篇是用平台連結代抽的 → owner 欠抽 -1。
        if (sponsorFromDebt && draft.owner_id) {
          ownerDebtCache[draft.owner_id] = Math.max(0, (ownerDebtCache[draft.owner_id] ?? 1) - 1);
          await adjustOwnerSponsorDebt(draft.owner_id, -1).catch((e) => log.warn("遞減 owner 欠抽失敗", { ownerId: draft.owner_id, err: e }));
        }
        // backstop 通知：永久禁用帳號因欠抽堆積而恢復被抽（每 owner 本輪通知一次）。
        if (selfServicedThisPost && draft.owner_id && !selfServiceNotified.has(draft.owner_id)) {
          selfServiceNotified.add(draft.owner_id);
          await sendUserAlert(
            draft.owner_id,
            "🔁 你有帳號設為「永久完全不抽」，但累積的贊助文份額一直沒有其他帳號代為分擔，已達上限。為維持公平，該帳號已恢復被抽以補還；若要停止，請在其他帳號正常發文分擔，或改為「只抽一半」。",
            "sponsor_used"
          ).catch(() => {});
        }
      }

      // 永久完全禁用帳號：把這一篇的應抽份額轉為 owner 欠抽（+1），由其他帳號後續代抽補還。
      if (accrueOptOutDebt && draft.owner_id && sponsorTuid) {
        await incrementSponsorRedist(sponsorTuid).catch((e) => log.warn("累加轉出數失敗", { accId, err: e }));
        if (accId in sponsorRedistCache) sponsorRedistCache[accId] += 1;
        ownerDebtCache[draft.owner_id] = (ownerDebtCache[draft.owner_id] ?? 0) + 1;
        await adjustOwnerSponsorDebt(draft.owner_id, 1).catch((e) => log.warn("累加 owner 欠抽失敗", { ownerId: draft.owner_id, err: e }));
      }

      // 延遲留言：標 pending + 到期時間，交給下方的補留言 pass；
      // 立即留言：依實際成功與否落 published/failed（不要謊報 published）
      const replyPatch = deferReply
        ? { reply_status: "pending" as const, reply_due_at: new Date(nowMs + replyDelay * 60000).toISOString(), thread_cursor: 0 }
        : hasReply
          ? { reply_status: replyFailedInline ? ("failed" as const) : ("published" as const) }
          : {};
      // CAS 落地：只在仍是 publishing 時寫 published，避免覆寫掉並行 reclaim 已改成的
      // needs_verification（貼文確實已送出，postId 在手，保守留待人工確認即可）。
      const saved = await updateDraftStatusAtomic(draft.id, "published", "publishing", {
        published_post_id: postId,
        published_at: nowIso,
        ...replyPatch
      }, draft.owner_id ?? undefined);
      if (!saved) log.warn("發布成功但草稿已非 publishing，保留現狀不覆寫", { draftId: draft.id, postId });
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
        await updateDraftStatus(draft.id, "needs_verification", { error: msg }, draft.owner_id ?? undefined);
        (result.needsVerification ??= []).push({ id: draft.id, error: msg });
        // 個人通知：發布不確定需人工確認 → 推給該草稿擁有者（已綁 Telegram 才送）。
        await sendUserAlert(
          draft.owner_id,
          `⚠️ 你的貼文「${draft.product_name ?? draft.id}」可能已發出但回應遺失，請到 Threads 確認後再決定重發或退回（草稿頁→待確認）。`,
          "publish_uncertain"
        ).catch(() => {});
      } else {
        await updateDraftStatus(draft.id, "failed", { error: msg }, draft.owner_id ?? undefined);
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
        // 個人通知：帳號被暫停（連續失敗）→ 推給該草稿擁有者。
        await sendUserAlert(
          draft.owner_id,
          `⛔ 你的發文帳號因連續失敗已暫停${cd}。請到帳號管理檢查 token／重新授權。`,
          "account_paused"
        ).catch(() => {});
      }
    }
  }

  // 平台級健康彙總告警：多帳號同時失敗或成功率驟降＝可能 Threads 全域故障/大規模風控，
  // 匯總成單一高優先告警，便於第一時間分辨「個別 token 過期」vs「系統性事件」（個別斷路器另有告警）。
  const attempted = result.published.length + result.failed.length + (result.needsVerification?.length ?? 0);
  if (attempted >= 5) {
    const rate = result.published.length / attempted;
    const brokenAccounts = alertedBroken.size;
    if (rate < 0.5 || brokenAccounts >= 3) {
      await sendAlert(
        `🚨 發文健康警示：本輪嘗試 ${attempted} 篇、成功率 ${Math.round(rate * 100)}%、觸發斷路器帳號 ${brokenAccounts} 個` +
          (result.needsVerification?.length ? `、待確認 ${result.needsVerification.length} 篇` : "") +
          "。可能為 Threads 全域故障或大規模風控，請儘速檢查。"
      ).catch(() => {});
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
  // 各 owner 自訂留言延遲（保底＋抖動）：依 owner 查一次並快取本輪；未設沿用 env。用於多段串文「下一段」排程。
  const replyPrefsCache: Record<string, { min: number; jitter: number }> = {};
  const replyPrefsFor = async (ownerId: string) => {
    if (!(ownerId in replyPrefsCache)) {
      const pp = await getPublishPrefs(ownerId).catch(() => null);
      replyPrefsCache[ownerId] = {
        min: pp?.replyDelayMinMinutes ?? env.replyDelayFloorMinutes,
        jitter: pp?.replyDelayJitterMinutes ?? env.replyDelayJitterMinutes
      };
    }
    return replyPrefsCache[ownerId];
  };
  for (const d of due) {
    if (Date.now() - startTime > 50000) break; // 守住 maxDuration，剩下的下輪再補
    const ownerId = d.owner_id;
    if (!ownerId) continue; // 無 owner（理論上不會發生）無法安全 owner 過濾，略過
    try {
      // 原子認領：搶不到代表已被處理/狀態變更 → 跳過，避免重複補發
      if (!(await claimReplyForPublish(d.id, ownerId))) continue;
      // 多段串文：取游標當前要補發的段落（單則留言＝長度 1 的鏈，向後相容）。
      const cursor = d.thread_cursor ?? 0;
      const step = chainStepAt(effectiveChain(d), cursor);
      if (!d.threads_account_id || !d.published_post_id || !step) {
        await markReplyFailed(d.id, ownerId, "缺帳號/主貼文/留言內容，無法補留言");
        out.failed++;
        continue;
      }
      // reply_to：第一段（cursor 0）接主貼文，之後接上一段成功發出的貼文 id。
      const replyTo = cursor === 0 ? d.published_post_id : d.thread_last_post_id;
      if (!replyTo) throw new Error("缺上一段貼文 id，無法接續串文");
      const creds = await getThreadsCredentials(d.threads_account_id, ownerId);
      if (!creds) throw new Error("找不到 Threads 帳號憑證");
      const segmentPostId = await publishReply(
        creds.threadsUserId,
        creds.accessToken,
        replyTo,
        step.segment.text ?? "",
        step.segment.media ?? []
      );
      if (step.isLast) {
        await advanceThreadSegment(d.id, ownerId, { lastPostId: segmentPostId, nextCursor: step.nextCursor, done: true });
      } else {
        // 還有下一段：回到 pending，排下一段的到期時間（沿用該 owner 留言延遲＋逐段不同抖動），下輪 cron 接續補。
        const rp = await replyPrefsFor(ownerId);
        const delay = replyDelayMinutes(`${d.id}:${step.nextCursor}`, rp.min, rp.jitter);
        const nextDueAt = new Date(Date.now() + delay * 60000).toISOString();
        await advanceThreadSegment(d.id, ownerId, { lastPostId: segmentPostId, nextCursor: step.nextCursor, done: false, nextDueAt });
      }
      out.published++;
    } catch (e) {
      await markReplyFailed(d.id, ownerId, e instanceof Error ? e.message : String(e)).catch((me) =>
        log.warn("標記延遲留言失敗時又失敗（將由 reclaim 回收）", { ownerId, draftId: d.id, err: me })
      );
      // 個人通知：分潤連結留言（串文 2/2）沒補上＝影響轉換，推給該草稿擁有者到草稿頁重補。
      await sendUserAlert(ownerId, "💬 你有一則分潤連結留言補發失敗，請到草稿頁「重試補留言」。", "reply_failed").catch(() => {});
      out.failed++;
    }
  }
  return out;
}
