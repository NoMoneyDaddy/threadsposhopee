// 統一資料存取層。
// - 有設定 Supabase → 走 Supabase（service-role），並以 ownerId 在應用層過濾，達成多租戶隔離。
// - 沒設定（Demo 模式）→ 用記憶體 + fixtures（單人，忽略 ownerId）。
import { getServiceClient } from "./supabase/server";
import { env, isDemoMode } from "./env";
import type { Draft } from "./types";
import { DEFAULT_COPY_PREFS, normalizeCopyPrefs, type CopyPrefs } from "@/services/ai/prefs";
import { planAccountQueue, projectToCronTick } from "@/services/publish/cadence";
import { getHeartbeat as readHeartbeat } from "./app-state"; // 本地呼叫（line ~18 的同名為 re-export，不建立本地綁定）
import { demo } from "./demo-store";
import { listThreadsAccounts } from "./accounts-store"; // getPublishPlan 內部用（re-export 不綁本地名）

// app_state 鍵值層（心跳/暫停/斷路器冷卻/JSON 快取/發文鎖）已拆到 ./app-state，
// 此處 re-export 維持既有 `@/lib/store` 匯入點不變（God File 漸進拆分）。
export {
  isPublishPaused,
  setPublishPaused,
  setHeartbeat,
  getHeartbeat,
  getAccountCircuitUntil,
  tripAccountCircuit,
  clearAccountCircuit,
  listActiveCircuits,
  getCachedJson,
  setCachedJson,
  acquirePublishLock,
  releasePublishLock,
  claimCronOnce
} from "./app-state";

// Telegram deeplink 綁定碼（app_state 一次性 token）已拆到 ./telegram-bind；
// 此處 re-export，維持「資料存取集中於 store」的匯入點慣例（與 app-state 同模式）。
export { createBindToken, consumeBindToken, cleanupExpiredBindTokens } from "./telegram-bind";

// 素材庫資料層已拆到 ./materials-store；此處 re-export 維持 `@/lib/store` 匯入點不變。
export {
  findMaterial,
  getMaterial,
  listMaterials,
  listPendingMaterials,
  approveMaterialIntake,
  updateMaterialMedia,
  updateMaterialContent,
  createMaterial,
  saveDraftToMaterial,
  deleteMaterial,
  listMaterialsToCheck,
  reviveAffiliateLink,
  updateMaterialProductLink,
  setAffiliateChecked,
  setMaterialCommission,
  setMaterialEvergreen,
  setAllMaterialsEvergreen,
  listEvergreenDueAll,
  touchEvergreen,
  isEvergreenDue,
  setMaterialShared,
  listSharedMaterials,
  listMySharedMaterials,
  getProductPublishedCounts,
  getProductEngagement,
  listPublishedPostsNeedingMetrics,
  upsertPostMetric,
  sharedRankScore,
  listHotProducts,
  listSharedForReview,
  setMaterialReview,
  toggleMaterialFavorite,
  listFavoritedIds,
  getSharedMaterial,
  incrementImportCount,
  countSharedByOwner,
  getImportsUsed,
  incrementImportsUsed,
  getContributionScore,
  incrementContributionBonus,
  type MaterialToCheck,
  type SharedMaterial
} from "./materials-store";

// 管理員／身份組／旗標／統計／排行榜資料層。
export {
  getRoles,
  setRoles,
  resolveUserIdByEmail,
  getFeatureFlags,
  setFeatureFlags,
  getAdminStats,
  listTopContributors,
  listOwnersWithNotify,
  listUsersOverview,
  listThreadsAccountsStatus,
  listRecentSponsorRecords,
  getSponsorShareSummary,
  DEFAULT_FLAGS,
  type FeatureFlags,
  type AdminStats,
  type Contributor,
  type UserOverviewRow,
  type ThreadsAccountStatusRow,
  type SponsorRecordView,
  type SponsorShareSummary
} from "./admin-store";

// 草稿資料層（CRUD/排程時段/發文佇列/延遲留言生命週期）已拆到 ./drafts-store；
// 此處 re-export 維持既有 `@/lib/store` 匯入點不變（God File 漸進拆分）。
export {
  createDraftFromMaterial,
  countMaterialReposts,
  listRecentPublishedPosts,
  listDrafts,
  listTakenScheduledSlots,
  rescheduleDraft,
  wasProductPublishedSince,
  getDraft,
  createDraft,
  updateDraft,
  deleteDraft,
  updateDraftStatus,
  reclaimStalePublishing,
  listRepliesDue,
  listFailedReplies,
  claimReplyForPublish,
  reclaimStaleReplies,
  markReplyPublished,
  markReplyFailed,
  advanceThreadSegment,
  requeueReply,
  updateDraftStatusAtomic,
  listApprovedDrafts,
  listNeedsVerificationAll,
  mainTextUsedByOtherOwner,
  listApprovedDraftsForShard,
  listPublishedDates,
  countPublished,
  countPublishedTodayByAccount,
  type PublishedPostRef,
  type ReplyDueDraft
} from "./drafts-store";

// Threads／Shopee 帳號資料層（CRUD/憑證/擁有權/token 展期）已拆到 ./accounts-store；
// 此處 re-export 維持既有 `@/lib/store` 匯入點不變（God File 漸進拆分）。
export {
  listThreadsAccounts,
  getThreadsCredentials,
  userOwnsThreadsAccount,
  userOwnsShopeeAccount,
  listThreadsAccountTokens,
  createThreadsAccount,
  upsertThreadsAccountFromOAuth,
  listShopeeAccounts,
  getShopeeCredentials,
  createShopeeAccount,
  setThreadsAccountStatus,
  renameThreadsAccount,
  deleteThreadsAccount,
  deleteThreadsAccountsByThreadsUserId,
  deleteShopeeAccount,
  deleteOwnerAccount,
  listActiveThreadsCredentials,
  listActiveThreadsAccountsAll,
  listThreadsTokensToRefresh,
  listActiveThreadsTokensAll,
  updateThreadsToken,
  updateThreadsAccountProfile,
  markThreadsAccountError,
  canAddThreadsAccount
} from "./accounts-store";

// 個人憑證／設定層（profiles 表：Apify/Gemini/Telegram/ShopeeAffiliateId/Cloudinary）
// 已拆到 ./credentials；此處 re-export 維持既有 `@/lib/store` 匯入點不變（God File 漸進拆分）。
export {
  getApifyCredentials,
  setApifyCredentials,
  setApifyActor,
  hasApifyCredentials,
  getGeminiKey,
  setGeminiKey,
  hasGeminiKey,
  getUserGeminiModel,
  setUserGeminiModel,
  resolveGeminiModel,
  getUserTelegramChatId,
  setUserTelegramChatId,
  getOwnerByTelegramChatId,
  getShopeeAffiliateId,
  setShopeeAffiliateId,
  getShopeeSubId,
  setShopeeSubId,
  getAutoReviveLinks,
  setAutoReviveLinks,
  getDefaultShareMaterials,
  setDefaultShareMaterials,
  getPublishPrefs,
  setPublishPrefs,
  getNotifyPrefs,
  setNotifyPrefs,
  getRepostLimits,
  setRepostLimits,
  getUserCloudinary,
  getUserCloudinaryFull,
  setUserCloudinary,
  getUserR2,
  hasUserR2,
  setUserR2,
  type R2Settings,
  getBioSettings,
  setBioSettings,
  normalizeBioHandle,
  getDisplayName,
  setDisplayName,
  normalizeDisplayName,
  getSponsorRewardMode,
  setSponsorRewardMode,
  type SponsorRewardMode
} from "./credentials";

// AI 文案客製化偏好（非機密，明文 jsonb）。讀取一律經 normalizeCopyPrefs 夾成合法值。
export async function getCopyPrefs(ownerId: string): Promise<CopyPrefs> {
  if (isDemoMode) return DEFAULT_COPY_PREFS;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("profiles").select("copy_prefs").eq("id", ownerId).maybeSingle();
  // 查詢失敗（DB 異常）要拋出，不可與「無此列」混為一談而靜默回退預設——
  // 否則表單載入會把預設誤當使用者偏好，存檔後反而覆寫原本設定。
  if (error) throw error;
  return normalizeCopyPrefs(data?.copy_prefs);
}

export async function setCopyPrefs(ownerId: string, prefs: unknown): Promise<CopyPrefs> {
  const clean = normalizeCopyPrefs(prefs);
  if (isDemoMode) return clean;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, copy_prefs: clean }, { onConflict: "id" });
  if (error) throw error;
  return clean;
}

// 監看來源資料層 + 來源貼文去重已拆到 ./sources-store；re-export 維持匯入點不變。
export {
  listSources,
  listAllEnabledSources,
  getSource,
  createSource,
  getScrapeConfig,
  saveScrapeConfig,
  setSourceEnabled,
  setSourceAutoPublish,
  deleteSource,
  isPostProcessed,
  markPostProcessed,
  listProcessedPostIds
} from "./sources-store";

// 意見回饋／工單層（feedback 表）已拆到 ./feedback-store；此處 re-export 維持
// 「資料存取集中於 @/lib/store」的匯入點慣例（與 accounts/sources/materials 等 sub-store 同模式）。
export {
  listFeedbackForOwner,
  listAllFeedback,
  createFeedback,
  replyFeedbackAsAdmin,
  isFeedbackKind,
  isFeedbackStatus
} from "./feedback-store";

// 成效統計：指定時間窗內已發布貼文，依日期/商品/來源/帳號彙總（從自家發布資料，不需外部報表 API）。
export interface InsightsRange {
  startMs: number;
  endMs: number;
}
export interface PublishInsights {
  startMs: number;
  endMs: number;
  totalPublished: number;
  byDay: { date: string; count: number }[];
  byProduct: { name: string; count: number }[];
  bySource: { name: string; count: number }[];
  byAccount: { name: string; count: number }[];
}

export async function getPublishInsights(
  ownerId: string,
  range: InsightsRange,
  accounts?: { id: string; label: string | null }[]
): Promise<PublishInsights> {
  const sinceIso = new Date(range.startMs).toISOString();
  const untilIso = new Date(range.endMs).toISOString();
  let rows: { product_name: string | null; source_id: string | null; threads_account_id: string | null; published_at: string | null }[];
  // 帳號 id→label 對照（分項報表用）。呼叫端可帶入已查好的清單，避免同請求重複查 threads_accounts。
  const accs = accounts ?? (await listThreadsAccounts(ownerId));
  const accLabel = new Map(accs.map((a) => [a.id, a.label]));
  if (isDemoMode) {
    rows = demo.drafts
      .filter((d) => {
        if (d.status !== "published") return false;
        const t = new Date(d.published_at ?? d.created_at).getTime();
        return t >= range.startMs && t <= range.endMs;
      })
      .map((d) => ({
        product_name: d.product_name ?? null,
        source_id: d.source_id ?? null,
        threads_account_id: d.threads_account_id ?? null,
        published_at: d.published_at ?? d.created_at
      }));
  } else {
    const sb = getServiceClient()!;
    const { data } = await sb
      .from("drafts")
      .select("product_name, source_id, threads_account_id, published_at")
      .eq("owner_id", ownerId)
      .eq("status", "published")
      .gte("published_at", sinceIso)
      .lte("published_at", untilIso)
      .limit(5000); // 上限，避免極大量發布時撐爆記憶體
    rows = data ?? [];
  }

  const dayMap = new Map<string, number>();
  const prodMap = new Map<string, number>();
  const srcMap = new Map<string, number>();
  const accMap = new Map<string, number>();
  for (const r of rows) {
    const day = r.published_at
      ? new Date(r.published_at).toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        })
      : "—";
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    const p = r.product_name ?? "（未命名商品）";
    prodMap.set(p, (prodMap.get(p) ?? 0) + 1);
    const s = r.source_id ?? "手動／批次";
    srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
    const a = r.threads_account_id ? accLabel.get(r.threads_account_id) ?? "（已移除帳號）" : "未指定帳號";
    accMap.set(a, (accMap.get(a) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);

  return {
    startMs: range.startMs,
    endMs: range.endMs,
    totalPublished: rows.length,
    byDay: [...dayMap.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    byProduct: top(prodMap, 10),
    bySource: top(srcMap, 10),
    byAccount: top(accMap, 20)
  };
}

export interface PublishPlanRow {
  id: string;
  productName: string | null;
  accountLabel: string;
  etaIso: string | null;
  reason: string;
}

// 規劃用：owner 自己「已核准」的草稿（含未來排程），不受 listDrafts 的 100 列上限影響。
async function listApprovedDraftsForPlan(ownerId: string, limit = 200): Promise<Draft[]> {
  if (isDemoMode) {
    // demo 為單人，忽略 ownerId（與其他 demo 查詢一致）
    return demo.drafts
      .filter((d) => d.status === "approved")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("drafts")
    .select("id, product_name, threads_account_id, scheduled_at, created_at, status")
    .eq("owner_id", ownerId)
    .eq("status", "approved")
    .order("created_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as Draft[];
}

// 發文進度/ETA（給使用者看「排隊中／下次預計幾點／塞車」）。
// 乾跑佇列節奏：依帳號分組，套用保底+抖動間隔與每日上限，算出每篇預計發文時間。
export async function getPublishPlan(ownerId: string): Promise<PublishPlanRow[]> {
  // 一併抓排程心跳：把可發時間對齊到下一個 cron tick，讓預計時間貼近實際送出（worker 只在 cron 醒來時送）。
  const [drafts, accounts, lastCronAt] = await Promise.all([
    listApprovedDraftsForPlan(ownerId),
    listThreadsAccounts(ownerId),
    readHeartbeat().catch(() => null)
  ]);
  const labelOf = new Map(accounts.map((a) => [a.id, a.label] as const));
  // 多租戶：只規劃 owner 自己擁有的帳號（即使草稿異常引用他人帳號也不跨租戶讀狀態）
  const approved = drafts.filter((d) => d.threads_account_id && labelOf.has(d.threads_account_id));
  if (approved.length === 0) return [];
  const now = Date.now();
  const lastCronMs = lastCronAt ? Date.parse(lastCronAt) : null;
  const cronIntervalMs = env.cronIntervalMinutes * 60_000;
  // 把 planAccountQueue 算出的「可發時間」對齊到下一個 cron tick（null＝帳號非啟用，維持 null）。
  const toCronAlignedIso = (iso: string | null): string | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    return new Date(projectToCronTick(ms, lastCronMs, cronIntervalMs)).toISOString();
  };

  // 依帳號分組，組內依 created_at 排序（與發文 worker 的處理順序一致）
  const byAccount = new Map<string, Draft[]>();
  for (const d of approved) {
    const arr = byAccount.get(d.threads_account_id!) ?? [];
    arr.push(d);
    byAccount.set(d.threads_account_id!, arr);
  }

  // 各帳號狀態並行抓，避免迴圈內序列化查詢（N+1）
  const stateEntries = await Promise.all(
    Array.from(byAccount.keys()).map(async (accId) => [accId, await getAccountPublishState(accId, ownerId).catch(() => null)] as const)
  );
  const stateMap = new Map(stateEntries);

  const rows: PublishPlanRow[] = [];
  for (const [accId, list] of byAccount) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at)); // 對齊 worker（listApprovedDrafts 依 created_at）
    const state = stateMap.get(accId);
    if (!state) continue;
    if (state.accountStatus !== "active") {
      for (const d of list) {
        rows.push({ id: d.id, productName: d.product_name ?? null, accountLabel: labelOf.get(accId) ?? "帳號", etaIso: null, reason: `帳號${state.accountStatus}，暫停發文` });
      }
      continue;
    }
    const plan = planAccountQueue({
      drafts: list.map((d) => ({ id: d.id, scheduledAt: d.scheduled_at ?? null })),
      lastPublishedAt: state.lastPublishedAt,
      publishedLast24h: state.publishedLast24h,
      floorMin: env.publishMinGapMinutes,
      jitterMax: env.publishGapJitterMinutes,
      dailyCap: env.publishMaxPerDay,
      accountId: accId,
      now
    });
    const planById = new Map(plan.map((p) => [p.id, p] as const));
    for (const d of list) {
      const p = planById.get(d.id);
      rows.push({
        id: d.id,
        productName: d.product_name ?? null,
        accountLabel: labelOf.get(accId) ?? "帳號",
        etaIso: toCronAlignedIso(p?.etaIso ?? null),
        reason: p?.reason ?? "排隊中"
      });
    }
  }
  // 依預計時間排序（null 殿後）
  rows.sort((a, b) => (a.etaIso ?? "9999").localeCompare(b.etaIso ?? "9999"));
  return rows;
}

// 某 Threads 帳號的發文節奏狀態 + 帳號狀態（背景 worker 用）。
// accountStatus：active 才會被發文；error/paused（如展期失敗）會被佇列跳過。
// ownerId（選填）：傳入則對 drafts 查詢加 owner_id 過濾，強化多租戶隔離；
// 背景 worker 跨租戶處理時可不傳。
export async function getAccountPublishState(
  threadsAccountId: string,
  ownerId?: string
): Promise<{ lastPublishedAt: string | null; publishedLast24h: number; accountStatus: string; createdAt: string | null }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (isDemoMode) {
    const acc = demo.threadsAccounts.find((a) => a.id === threadsAccountId);
    const published = demo.drafts.filter((d) => d.threads_account_id === threadsAccountId && d.status === "published");
    const last = published.map((d) => d.published_at ?? d.created_at).sort().pop();
    return {
      lastPublishedAt: last ?? null,
      publishedLast24h: published.filter((d) => (d.published_at ?? d.created_at) >= since).length,
      accountStatus: acc?.status ?? "active",
      createdAt: (acc as { created_at?: string } | undefined)?.created_at ?? null
    };
  }
  const sb = getServiceClient()!;
  // 多租戶：有 ownerId 時一併過濾帳號歸屬（service-role 繞 RLS）
  let accQ = sb.from("threads_accounts").select("status, created_at").eq("id", threadsAccountId);
  if (ownerId) accQ = accQ.eq("owner_id", ownerId);
  const { data: acc, error: accError } = await accQ.maybeSingle();
  if (accError) throw accError;
  if (!acc) throw new Error(`找不到 ID 為 ${threadsAccountId} 的 Threads 帳號`);
  let latestQ = sb
    .from("drafts")
    .select("published_at")
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published");
  if (ownerId) latestQ = latestQ.eq("owner_id", ownerId);
  const { data: latest } = await latestQ.order("published_at", { ascending: false }).limit(1);
  let countQ = sb
    .from("drafts")
    .select("*", { count: "exact", head: true })
    .eq("threads_account_id", threadsAccountId)
    .eq("status", "published")
    .gte("published_at", since);
  if (ownerId) countQ = countQ.eq("owner_id", ownerId);
  const { count } = await countQ;
  return {
    lastPublishedAt: latest?.[0]?.published_at ?? null,
    publishedLast24h: count ?? 0,
    accountStatus: acc.status,
    createdAt: acc.created_at ?? null
  };
}

// 儀表板統計（依登入者隔離）
export async function getDashboardStats(ownerId: string): Promise<{
  threadsAccounts: number;
  sources: number;
  materials: number;
  drafts: { draft: number; approved: number; published: number; failed: number };
  publishedLast24h: number;
  // 需要注意：token 展期失敗(error)、手動暫停(paused)、token 即將到期/已過期(tokenExpiring) 的帳號數
  accountIssues: { error: number; paused: number; tokenExpiring: number };
  // 延遲留言（串文 2/2）：待補(pending)／補發失敗(failed) 數，讓 owner 一眼看出是否卡住
  replies: { pending: number; failed: number };
  // 健檢標記失效的素材數（連結已死、待重產/人工處理）
  invalidMaterials: number;
  // 發布狀態待人工確認（可能已發出）的草稿數——需盡快處理以免重複發文或漏發
  needsVerification: number;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // token 即將到期門檻：到期前 7 天（與展期視窗一致），含已過期
  const expSoon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (isDemoMode) {
    const by = (s: string) => demo.drafts.filter((d) => d.status === s).length;
    const accBy = (s: string) => demo.threadsAccounts.filter((a) => a.status === s).length;
    const replyBy = (s: string) => demo.drafts.filter((d) => d.reply_status === s).length;
    return {
      threadsAccounts: demo.threadsAccounts.length,
      sources: demo.sources.filter((s) => s.enabled).length,
      materials: demo.materials.length,
      drafts: { draft: by("draft"), approved: by("approved"), published: by("published"), failed: by("failed") },
      publishedLast24h: demo.drafts.filter((d) => d.status === "published").length,
      accountIssues: {
        error: accBy("error"),
        paused: accBy("paused"),
        tokenExpiring: demo.threadsAccounts.filter((a) => a.token_expires_at && a.token_expires_at <= expSoon).length
      },
      replies: { pending: replyBy("pending"), failed: replyBy("failed") },
      invalidMaterials: demo.materials.filter((m) => m.affiliate_valid === false).length,
      needsVerification: by("needs_verification")
    };
  }
  const sb = getServiceClient()!;
  const count = async (table: string, build: (q: any) => any = (q) => q): Promise<number> => {
    const { count: c } = await build(sb.from(table).select("*", { count: "exact", head: true }).eq("owner_id", ownerId));
    return c ?? 0;
  };
  const [threadsAccounts, sources, materials, draft, approved, published, failed, publishedLast24h, accError, accPaused, replyPending, replyFailed, tokenExpiring, invalidMaterials, needsVerification] =
    await Promise.all([
      count("threads_accounts"),
      count("sources", (q) => q.eq("enabled", true)),
      count("materials"),
      count("drafts", (q) => q.eq("status", "draft")),
      count("drafts", (q) => q.eq("status", "approved")),
      count("drafts", (q) => q.eq("status", "published")),
      count("drafts", (q) => q.eq("status", "failed")),
      count("drafts", (q) => q.eq("status", "published").gte("published_at", since)),
      count("threads_accounts", (q) => q.eq("status", "error")),
      count("threads_accounts", (q) => q.eq("status", "paused")),
      count("drafts", (q) => q.eq("reply_status", "pending")),
      count("drafts", (q) => q.eq("reply_status", "failed")),
      count("threads_accounts", (q) => q.eq("status", "active").not("token_expires_at", "is", null).lte("token_expires_at", expSoon)),
      count("materials", (q) => q.eq("affiliate_valid", false)),
      count("drafts", (q) => q.eq("status", "needs_verification"))
    ]);
  return {
    threadsAccounts,
    sources,
    materials,
    drafts: { draft, approved, published, failed },
    publishedLast24h,
    accountIssues: { error: accError, paused: accPaused, tokenExpiring },
    replies: { pending: replyPending, failed: replyFailed },
    invalidMaterials,
    needsVerification
  };
}


