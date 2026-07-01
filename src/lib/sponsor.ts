// 贊助文設定（功能 B）：owner 設定要替換進贊助文的平台分潤連結、冷門時段與開關。
// 存 app_state 單列（key=sponsor_config），demo 走預設值。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { parseSubIdSlots, isValidSubIdTemplate } from "@/services/shopee/subid";

export interface SponsorConfig {
  enabled: boolean;
  offPeakStart: number; // 冷門時段起（小時 0–23，Asia/Taipei）。註：比例制上線後不再用於贊助判定，保留以相容舊設定。
  offPeakEnd: number; // 冷門時段迄（小時 0–24）。同上，保留相容。
  // 贊助分潤連結的自訂 sub_id（逗號分隔，最多 5 格，對齊蝦皮 sub_id1..5）。
  // 每格支援變數 {date}/{time}/{platform}/{account}/{item}，建連結時自動代換。例：sponsor,{date}
  subIds: string;
  // 比例制（B+A）：贊助配額依使用者「當日自己實際發文量」計算，只換使用者自己的貼文、不再注入管理員內容。
  perPosts: number; // 每幾篇自發文 +1 篇贊助（抽成率槓桿；大＝抽更少）。
  floor: number; // 每日保底贊助篇數（達 minPostsForFloor 才觸發）。
  minPostsForFloor: number; // 當日自發 < 此值者完全不抽（低頻使用者友善門檻）。
}

const KEY = "sponsor_config";
export const DEFAULT_SPONSOR_CONFIG: SponsorConfig = {
  enabled: false,
  offPeakStart: 2,
  offPeakEnd: 5,
  subIds: "sponsor",
  // 預設：每 6 篇抽 1、保底 1、但當日自發 < 3 篇不抽（低頻者免）。
  perPosts: 6,
  floor: 1,
  minPostsForFloor: 3
};

export async function getSponsorConfig(): Promise<SponsorConfig> {
  if (isDemoMode) return DEFAULT_SPONSOR_CONFIG;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", KEY).maybeSingle();
  if (!data?.value) return DEFAULT_SPONSOR_CONFIG;
  try {
    return { ...DEFAULT_SPONSOR_CONFIG, ...(JSON.parse(data.value) as Partial<SponsorConfig>) };
  } catch {
    return DEFAULT_SPONSOR_CONFIG;
  }
}

export async function setSponsorConfig(cfg: SponsorConfig): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: KEY, value: JSON.stringify(cfg), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// ── 純函式（可單測）───────────────────────────────────────────

// 取台北時區的「日期字串 YYYY-MM-DD」與「小時 0–23」。
export function taipeiParts(now: Date = new Date()): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24; // 某些環境午夜回 "24"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

// 是否落在冷門時段 [start, end)（小時）。
export function inOffPeak(hour: number, start: number, end: number): boolean {
  return hour >= start && hour < end;
}

// 分潤率字串小數（如 "0.05"）格式化為百分比顯示（"5%"）。無效/空回 null。純函式。
export function formatCommissionRate(rate: string | null | undefined): string | null {
  if (rate == null || rate === "") return null;
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n * 100;
  // 去除多餘小數（5 而非 5.00；5.5 保留）。
  return `${Number(pct.toFixed(2))}%`;
}

// 把文字中的舊分潤連結替換為平台贊助連結。舊連結不存在時：有內容就在結尾補上平台連結。
// 就地替換：只在文中確實含 oldLink 時替換；找不到就「原文不動」回傳（不再 append）。
// 避免把平台分潤連結硬接到不含商品連結的文末（雙連結/錯置且使用者站內看不到）。
// 呼叫端據「回傳是否與原文不同」判定 swap 是否真的發生，未發生就放棄本篇贊助。
export function swapAffiliateLink(text: string | null | undefined, oldLink: string | null | undefined, sponsorLink: string): string {
  const t = text ?? "";
  if (oldLink && t.includes(oldLink)) return t.split(oldLink).join(sponsorLink);
  return t;
}

// 該不該把這篇當成贊助文（就地換連結）：
// - 啟用、非 owner 帳號、當日尚未達配額（alreadyDoneToday，配額依使用者自身發文量算）為前提。
// - 使用者自選一篇（pickDraftId）：只認那一篇；有指定時段（pickHour）則限該時，否則一發即贊助。
// - 未自選（比例制）：在配額內的當篇即成為贊助文（不再限冷門時段——贊助一律取自使用者自己的貼文）。
export function shouldSponsor(opts: {
  enabled: boolean;
  isOwnerAccount: boolean;
  hour: number;
  alreadyDoneToday: boolean;
  thisDraftId?: string;
  pickDraftId?: string | null;
  pickHour?: number | null;
}): boolean {
  if (!opts.enabled || opts.isOwnerAccount || opts.alreadyDoneToday) return false;
  if (opts.pickDraftId) {
    if (opts.thisDraftId !== opts.pickDraftId) return false;
    return opts.pickHour == null ? true : opts.hour === opts.pickHour;
  }
  return true;
}

// ══ 帳號持久贊助狀態（sponsor_account_stats 表，主鍵＝threads_user_id）══════════════════
// R2-D：由 app_state（以內部 uuid 為鍵）改為專屬表＋穩定的 threads_user_id 為鍵，
// 讓「刪帳號重加同一 Threads 帳號」無法洗掉黑名單/違規罰則/累積贊助歷史。呼叫端一律傳 threads_user_id。
export interface SponsorStats {
  threadsUserId: string;
  sponsoredCount: number;
  redistCount: number;
  blocked: boolean;
  penaltyFactor: number | null;
  penaltyUntil: string | null;
  optout: SponsorOptOutRaw | null;
  pick: SponsorPick | null;
}
interface SponsorStatsRow {
  threads_user_id: string;
  sponsored_count: number | null;
  redist_count: number | null;
  blocked: boolean | null;
  penalty_factor: number | string | null;
  penalty_until: string | null;
  optout: SponsorOptOutRaw | null;
  pick: SponsorPick | null;
}
const STATS_COLS = "threads_user_id,sponsored_count,redist_count,blocked,penalty_factor,penalty_until,optout,pick";

async function getStatsRow(tuid: string): Promise<SponsorStatsRow | null> {
  if (isDemoMode || !tuid) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("sponsor_account_stats").select(STATS_COLS).eq("threads_user_id", tuid).maybeSingle();
  return (data as SponsorStatsRow | null) ?? null;
}

// 批次讀多帳號狀態（發文佇列一次載入，省 N 次查詢）。回傳 tuid -> row。
async function getStatsRows(tuids: string[]): Promise<Map<string, SponsorStatsRow>> {
  const map = new Map<string, SponsorStatsRow>();
  const uniq = Array.from(new Set(tuids.filter(Boolean)));
  if (isDemoMode || uniq.length === 0) return map;
  const sb = getServiceClient()!;
  const { data } = await sb.from("sponsor_account_stats").select(STATS_COLS).in("threads_user_id", uniq);
  for (const row of (data as SponsorStatsRow[] | null) ?? []) map.set(row.threads_user_id, row);
  return map;
}

// 更新（upsert）本表指定欄位。null 值以「清除該欄位」語意寫入。
async function patchStats(tuid: string, patch: Partial<Omit<SponsorStatsRow, "threads_user_id">>): Promise<void> {
  if (isDemoMode || !tuid) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("sponsor_account_stats")
    .upsert({ threads_user_id: tuid, ...patch, updated_at: new Date().toISOString() }, { onConflict: "threads_user_id" });
  if (error) throw new Error(`更新贊助帳號狀態失敗：${error.message}`);
}

// ── 使用者自選贊助文（sponsor_account_stats.pick）──────
export interface SponsorPick {
  draftId: string;
  hour: number | null; // 指定發文時段（小時 0–23）；null = 該篇一發即贊助
}

export async function getSponsorPick(threadsUserId: string): Promise<SponsorPick | null> {
  const row = await getStatsRow(threadsUserId);
  return normalizePick(row?.pick);
}

function normalizePick(pick: SponsorPick | null | undefined): SponsorPick | null {
  if (!pick || typeof pick.draftId !== "string" || !pick.draftId) return null;
  const hour = pick.hour == null ? null : Number(pick.hour);
  return { draftId: pick.draftId, hour: Number.isInteger(hour) ? (hour as number) : null };
}

export async function setSponsorPick(threadsUserId: string, pick: SponsorPick | null): Promise<void> {
  await patchStats(threadsUserId, { pick: pick ? { draftId: pick.draftId, hour: pick.hour } : null });
}

// 批次取多帳號的自選（草稿頁標示用）：回傳 threadsUserId -> draftId。
export async function getSponsorPickMap(threadsUserIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const rows = await getStatsRows(threadsUserIds);
  for (const [tuid, row] of rows) {
    const pick = normalizePick(row.pick);
    if (pick) out[tuid] = pick.draftId;
  }
  return out;
}

// ── 帳號臨時/永久禁用贊助文（sponsor_account_stats.optout）──────
// 用途：活動檔期/商業合作期間，讓某帳號暫時不套贊助文；到期自動恢復（無需完全暫停發文）。
export type SponsorOptOutMode = "off" | "half";
interface SponsorOptOutRaw {
  until?: string | null;
  mode?: string;
  permanent?: boolean;
}
export interface SponsorOptOut {
  until: string | null; // permanent 時可為 null
  mode: SponsorOptOutMode;
  permanent: boolean; // 永久禁用（無到期）；配套：mode=off+permanent 的應抽份額轉為 owner 欠抽由其他帳號代抽
}

// 解析 optout 值（jsonb 物件；相容舊資料只有 until 的情形）。回傳仍生效者（永久恆生效；否則需未過期），否則 null。
function parseOptOut(raw: SponsorOptOutRaw | null | undefined): SponsorOptOut | null {
  if (!raw) return null;
  const mode: SponsorOptOutMode = raw.mode === "half" ? "half" : "off";
  const permanent = Boolean(raw.permanent);
  if (permanent) return { until: null, mode, permanent: true }; // 永久恆生效
  const until = raw.until ? String(raw.until) : null;
  const t = Date.parse(String(until));
  if (!Number.isFinite(t) || t <= Date.now()) return null; // 過期＝視同未設
  return { until, mode, permanent: false };
}

// 回傳目前生效的禁用設定（含模式/永久）；過期/未設回 null。
export async function getSponsorOptOut(threadsUserId: string): Promise<SponsorOptOut | null> {
  const row = await getStatsRow(threadsUserId);
  return parseOptOut(row?.optout);
}

// 相容既有呼叫點：只回到期 ISO（永久回固定遠期字串以示「生效中」）。
export async function getSponsorOptOutUntil(threadsUserId: string): Promise<string | null> {
  const o = await getSponsorOptOut(threadsUserId);
  if (!o) return null;
  return o.permanent ? "9999-12-31T00:00:00.000Z" : o.until;
}

// 設定/清除：permanent=true＝永久（忽略 untilIso）；否則 untilIso 為 null/過去＝清除。mode 預設 off。
export async function setSponsorOptOut(
  threadsUserId: string,
  untilIso: string | null,
  mode: SponsorOptOutMode = "off",
  permanent = false
): Promise<void> {
  if (!permanent && (!untilIso || Date.parse(untilIso) <= Date.now())) {
    await patchStats(threadsUserId, { optout: null }); // 清除
    return;
  }
  const payload: SponsorOptOut = permanent ? { until: null, mode, permanent: true } : { until: untilIso, mode, permanent: false };
  await patchStats(threadsUserId, { optout: payload });
}

// ── 違規加重抽成懲罰（sponsor_account_stats.penalty_factor/penalty_until）──────
// 違規（連結被竄改）不再暫停贊助或停帳號（那等於獎勵竄改者、平台還少賺），改為一段期間「加重抽成」：
// 該帳號 perPosts 除以 factor（抽更多）作為懲罰——有實質代價、且平台反而多賺，正打在動機上。到期自動恢復。
function activePenalty(factor: number | string | null | undefined, until: string | null | undefined): number {
  const t = Date.parse(String(until ?? ""));
  if (!Number.isFinite(t) || t <= Date.now()) return 1; // 過期/未設
  const f = Number(factor);
  return Number.isFinite(f) && f >= 1 ? f : 1;
}

// 目前生效的加重倍數（>=1；1＝無懲罰）。過期/未設回 1。
export async function getSponsorPenaltyFactor(threadsUserId: string): Promise<number> {
  const row = await getStatsRow(threadsUserId);
  return activePenalty(row?.penalty_factor, row?.penalty_until);
}

// 設定加重抽成懲罰（factor 倍、到 untilIso）。factor<=1 或無到期＝清除。
export async function setSponsorPenalty(threadsUserId: string, factor: number, untilIso: string | null): Promise<void> {
  if (!untilIso || Date.parse(untilIso) <= Date.now() || !(factor > 1)) {
    await patchStats(threadsUserId, { penalty_factor: null, penalty_until: null });
    return;
  }
  await patchStats(threadsUserId, { penalty_factor: factor, penalty_until: untilIso });
}

// ── 管理員贊助黑名單（sponsor_account_stats.blocked）──────
// 管理員可把濫用/高風險帳號永久排除贊助。改綁 threads_user_id：刪帳號重加無法規避封鎖。
export async function getSponsorBlocklist(): Promise<string[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("sponsor_account_stats").select("threads_user_id").eq("blocked", true).limit(5000);
  return (data ?? []).map((r) => r.threads_user_id as string).filter(Boolean);
}

export async function setSponsorBlocked(threadsUserId: string, blocked: boolean): Promise<void> {
  await patchStats(threadsUserId, { blocked });
}

// ── 累積贊助數 / 已轉出份額（sponsor_account_stats.sponsored_count / redist_count）──────
// 累積比例判定用：不掃全部每日紀錄（昂貴），改維護每帳號累積計數器。
export async function getSponsorTotal(threadsUserId: string): Promise<number> {
  const row = await getStatsRow(threadsUserId);
  const n = Number(row?.sponsored_count ?? 0);
  return Number.isFinite(n) ? n : 0;
}
// 原子累加：走 DB 端 bump_sponsor_stat（單次 upsert），消除讀-加-寫的併發覆寫/漂移。回傳累加後新值（demo 回 0）。
export async function incrementSponsorTotal(threadsUserId: string): Promise<number> {
  if (isDemoMode || !threadsUserId) return 0;
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("bump_sponsor_stat", { p_tuid: threadsUserId, p_sponsored: 1, p_redist: 0 });
  if (error) throw new Error(`累加贊助累積數失敗：${error.message}`);
  return typeof data === "number" ? data : 0;
}

export async function getSponsorRedist(threadsUserId: string): Promise<number> {
  const row = await getStatsRow(threadsUserId);
  const n = Number(row?.redist_count ?? 0);
  return Number.isFinite(n) ? n : 0;
}
export async function incrementSponsorRedist(threadsUserId: string): Promise<number> {
  if (isDemoMode || !threadsUserId) return 0;
  const sb = getServiceClient()!;
  const { error } = await sb.rpc("bump_sponsor_stat", { p_tuid: threadsUserId, p_sponsored: 0, p_redist: 1 });
  if (error) throw new Error(`累加轉出數失敗：${error.message}`);
  return 0;
}

// 批次載入多帳號的贊助狀態（發文佇列決策用）：回傳 threadsUserId -> 正規化後的 SponsorStats。
export async function getSponsorStatsMap(threadsUserIds: string[]): Promise<Map<string, SponsorStats>> {
  const out = new Map<string, SponsorStats>();
  const rows = await getStatsRows(threadsUserIds);
  for (const [tuid, r] of rows) {
    out.set(tuid, {
      threadsUserId: tuid,
      sponsoredCount: Number(r.sponsored_count ?? 0) || 0,
      redistCount: Number(r.redist_count ?? 0) || 0,
      blocked: Boolean(r.blocked),
      penaltyFactor: r.penalty_factor == null ? null : Number(r.penalty_factor),
      penaltyUntil: r.penalty_until ?? null,
      optout: r.optout ?? null,
      pick: normalizePick(r.pick)
    });
  }
  return out;
}
// 從批次結果解析「目前生效」的禁用/罰則（純函式，供佇列免再查 DB）。
export function statsOptOut(stats: SponsorStats | undefined): SponsorOptOut | null {
  return parseOptOut(stats?.optout);
}
export function statsPenaltyFactor(stats: SponsorStats | undefined): number {
  return activePenalty(stats?.penaltyFactor ?? null, stats?.penaltyUntil ?? null);
}

// 帳號刪除時清除「以內部 uuid 為鍵、且非防濫用關鍵」的殘留（每日紀錄、違規時窗計數）。
// 刻意「不」清除 sponsor_account_stats（黑名單/罰則/累積以 threads_user_id 綁定）：這正是重綁要保留的防規避歷史；
// 使用者移除再重加同一 Threads 帳號時，封鎖與罰則須延續。真正的資料刪除（Meta 解除授權）走 deleteSponsorStatsByThreadsUserId。
export async function clearSponsorStateForAccount(accountId: string): Promise<void> {
  if (isDemoMode || !accountId) return;
  const sb = getServiceClient()!;
  await sb.from("app_state").delete().like("key", `sponsor:rec:${accountId}:%`);
  await sb.from("app_state").delete().eq("key", `sponsor_strikes:${accountId}`);
}

// Meta 解除授權／資料刪除回呼：真正抹除該 Threads 使用者的贊助持久狀態（合規）。冪等。
export async function deleteSponsorStatsByThreadsUserId(threadsUserId: string): Promise<void> {
  if (isDemoMode || !threadsUserId) return;
  const sb = getServiceClient()!;
  await sb.from("sponsor_account_stats").delete().eq("threads_user_id", threadsUserId);
}

// ── 跨帳號轉嫁：owner 欠抽債務（永久禁用配套；以 owner 為鍵，仍存 app_state）──────
// 永久「完全不抽」帳號的應抽份額 → 累加到 owner 欠抽（redebt）；由其他帳號代抽時遞減。走原子 RPC 避免併發漂移。
function ownerDebtKey(ownerId: string): string {
  return `sponsor:redebt:${ownerId}`;
}
export async function getOwnerSponsorDebt(ownerId: string): Promise<number> {
  if (isDemoMode || !ownerId) return 0;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", ownerDebtKey(ownerId)).maybeSingle();
  const n = data?.value ? parseInt(data.value, 10) : 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0; // 夾在 0 以上
}
// delta 可為負（代抽補還時 -1）；回傳新值（不夾）。
export async function adjustOwnerSponsorDebt(ownerId: string, delta: number): Promise<number> {
  if (isDemoMode || !ownerId) return 0;
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("increment_app_state_int", { p_key: ownerDebtKey(ownerId), p_delta: delta });
  if (error) throw new Error(`調整 owner 欠抽失敗：${error.message}`);
  return typeof data === "number" ? data : 0;
}

// ── 每日贊助紀錄（app_state：key=sponsor:rec:<accId>:<date>）──────
// 時序資料、已有保留期清理、非防濫用關鍵，仍以內部 accId 為鍵留在 app_state。
export interface SponsorRecord {
  postId: string;
  link: string;
  ownerId: string;
  at: string;
  verified?: boolean;
  violated?: boolean;
  deleted?: boolean; // 貼文已被使用者刪除/隱藏：視為正當下架（如蝦皮政策變動），不計違規
  ownLink?: boolean; // 高貢獻者選「換自己連結」：此篇用其自有分潤連結，非平台贊助，不納入違規驗證
  commissionRate?: string | null; // 贊助當下該商品的蝦皮分潤率快照（字串小數，如 "0.05"＝5%）；隨時間變動故記快照
}

function recKey(accountId: string, date: string): string {
  return `sponsor:rec:${accountId}:${date}`;
}

// 每日多篇贊助文：同一 (帳號,日期) 下可有多篇（依每日配額）。
// 儲存：app_state 單列 value = SponsorRecord[]（舊資料為單一物件，讀取時包成陣列向後相容）。
function parseRecords(value: string | null | undefined): SponsorRecord[] {
  if (!value) return [];
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? (v as SponsorRecord[]) : [v as SponsorRecord];
  } catch {
    return [];
  }
}

export async function getSponsorRecords(accountId: string, date: string): Promise<SponsorRecord[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", recKey(accountId, date)).maybeSingle();
  return parseRecords(data?.value);
}

// 今日已發贊助文篇數（配額閘門用）。
export async function countSponsorToday(accountId: string, date: string): Promise<number> {
  return (await getSponsorRecords(accountId, date)).length;
}

// 追加一筆當日贊助紀錄（讀現有陣列 → push → 寫回）。
export async function appendSponsorRecord(accountId: string, date: string, rec: SponsorRecord): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const recs = await getSponsorRecords(accountId, date);
  recs.push(rec);
  await sb
    .from("app_state")
    .upsert({ key: recKey(accountId, date), value: JSON.stringify(recs), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// 更新當日第 index 筆（驗證寫回 verified/violated）。
export async function updateSponsorRecordAt(accountId: string, date: string, index: number, rec: SponsorRecord): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const recs = await getSponsorRecords(accountId, date);
  if (index < 0 || index >= recs.length) return;
  recs[index] = rec;
  await sb
    .from("app_state")
    .upsert({ key: recKey(accountId, date), value: JSON.stringify(recs), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export interface SponsorRecordEntry {
  accountId: string;
  date: string;
  index: number; // 當日陣列中的位置（驗證寫回用）
  rec: SponsorRecord;
}

// 使用者自己的贊助紀錄（透明化）：依 rec.ownerId 過濾、時間新→舊，供「我的贊助文」資訊卡。
export async function listSponsorRecordsForOwner(ownerId: string, limit = 50): Promise<SponsorRecordEntry[]> {
  if (isDemoMode) return [];
  const all = await listAllSponsorRecords().catch(() => [] as SponsorRecordEntry[]);
  return all
    .filter((e) => e.rec.ownerId === ownerId)
    .sort((a, b) => (b.rec.at ?? "").localeCompare(a.rec.at ?? ""))
    .slice(0, limit);
}

// 管理頁用：撈出所有贊助紀錄（不論驗證狀態），分頁避免 1000 列截斷；逐列展開陣列、附 index。
export async function listAllSponsorRecords(): Promise<SponsorRecordEntry[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const out: SponsorRecordEntry[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("app_state")
      .select("key,value")
      .like("key", "sponsor:rec:%")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`讀取贊助紀錄失敗：${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const m = /^sponsor:rec:(.+):(\d{4}-\d{2}-\d{2})$/.exec(row.key);
      if (!m) continue;
      parseRecords(row.value).forEach((rec, index) => out.push({ accountId: m[1], date: m[2], index, rec }));
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// 驗證只需最近幾天的未驗證紀錄（發出滿 minAgeMs、通常數小時內就會被驗掉）；
// 更舊的未驗證多為讀不到/放棄的殘留，交由每日清理處理，不必每輪全掃。
const VERIFY_LOOKBACK_DAYS = 7;

function dateNDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// 撈出「尚未驗證、且已發出超過 minAgeMs」的贊助紀錄（給驗證排程用）。逐列展開陣列、附 index。
// 分頁掃描避免 PostgREST 1000 列上限靜默截斷（舊紀錄漏驗）；並只取近 VERIFY_LOOKBACK_DAYS 天。
export async function listSponsorRecordsToVerify(minAgeMs: number): Promise<SponsorRecordEntry[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const out: SponsorRecordEntry[] = [];
  const since = dateNDaysAgo(VERIFY_LOOKBACK_DAYS);
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("app_state")
      .select("key,value")
      .like("key", "sponsor:rec:%")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`讀取待驗贊助紀錄失敗：${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const m = /^sponsor:rec:(.+):(\d{4}-\d{2}-\d{2})$/.exec(row.key);
      if (!m) continue;
      if (m[2] < since) continue; // 只驗近 N 天（日期字串可直接字典序比較）
      const recs = parseRecords(row.value);
      recs.forEach((rec, index) => {
        if (rec.verified) return;
        if (Date.now() - new Date(rec.at).getTime() < minAgeMs) return;
        out.push({ accountId: m[1], date: m[2], index, rec });
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// 每日清理：刪除 retentionDays 天前的贊助紀錄列（sponsor:rec:<accId>:<date>），
// 避免 app_state 無限增長拖慢同表的鎖/心跳與全表掃描。驗證早已完成、僅供歷史，過保留期即可清。
export async function cleanupOldSponsorRecords(retentionDays = 90): Promise<{ deleted: number }> {
  if (isDemoMode) return { deleted: 0 };
  const sb = getServiceClient()!;
  const cutoff = dateNDaysAgo(retentionDays);
  const stale: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("app_state")
      .select("key")
      .like("key", "sponsor:rec:%")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`掃描待清理贊助紀錄失敗：${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const m = /^sponsor:rec:.+:(\d{4}-\d{2}-\d{2})$/.exec(row.key as string);
      if (m && m[1] < cutoff) stale.push(row.key as string);
    }
    if (rows.length < PAGE) break;
  }
  let deleted = 0;
  for (let i = 0; i < stale.length; i += PAGE) {
    const chunk = stale.slice(i, i + PAGE);
    const { error } = await sb.from("app_state").delete().in("key", chunk);
    if (error) throw new Error(`清理贊助紀錄失敗：${error.message}`);
    deleted += chunk.length;
  }
  return { deleted };
}

// 正規化＋驗證輸入（小時界線＋贊助 sub_id 多格）。贊助文連結改為「就地改寫各篇貼文的商品連結」，
// owner 只需設定要套在贊助連結上的 sub_id（可含變數）。
export function normalizeSponsorConfig(input: Partial<SponsorConfig>): { ok: true; cfg: SponsorConfig } | { ok: false; error: string } {
  const enabled = Boolean(input.enabled);
  const offPeakStart = Number(input.offPeakStart);
  const offPeakEnd = Number(input.offPeakEnd);
  if (!Number.isInteger(offPeakStart) || !Number.isInteger(offPeakEnd) || offPeakStart < 0 || offPeakStart > 23 || offPeakEnd < 1 || offPeakEnd > 24 || offPeakStart >= offPeakEnd) {
    return { ok: false, error: "冷門時段需為 0–24 的整數且起 < 迄" };
  }
  const slots = parseSubIdSlots(typeof input.subIds === "string" ? input.subIds : "");
  if (slots.some((s) => !isValidSubIdTemplate(s))) {
    return { ok: false, error: "贊助 sub_id 每格僅能含英數與變數 {date}/{time}/{platform}/{account}/{item}（底線會被蝦皮拒收，單格上限 50）" };
  }
  // 比例制參數：缺省退回預設；驗證為正整數且範圍合理。
  const perPosts = input.perPosts === undefined ? DEFAULT_SPONSOR_CONFIG.perPosts : Number(input.perPosts);
  const floor = input.floor === undefined ? DEFAULT_SPONSOR_CONFIG.floor : Number(input.floor);
  const minPostsForFloor =
    input.minPostsForFloor === undefined ? DEFAULT_SPONSOR_CONFIG.minPostsForFloor : Number(input.minPostsForFloor);
  if (!Number.isInteger(perPosts) || perPosts < 1 || perPosts > 100) {
    return { ok: false, error: "每幾篇抽 1（perPosts）需為 1–100 的整數" };
  }
  if (!Number.isInteger(floor) || floor < 0 || floor > 20) {
    return { ok: false, error: "每日保底贊助篇數（floor）需為 0–20 的整數" };
  }
  if (!Number.isInteger(minPostsForFloor) || minPostsForFloor < 1 || minPostsForFloor > 100) {
    return { ok: false, error: "低頻免抽門檻（minPostsForFloor）需為 1–100 的整數" };
  }
  return { ok: true, cfg: { enabled, offPeakStart, offPeakEnd, subIds: slots.join(","), perPosts, floor, minPostsForFloor } };
}
