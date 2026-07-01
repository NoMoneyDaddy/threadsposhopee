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

// 把文字中的舊分潤連結替換為平台贊助連結。舊連結不存在時：有內容就在結尾補上平台連結。
export function swapAffiliateLink(text: string | null | undefined, oldLink: string | null | undefined, sponsorLink: string): string {
  const t = text ?? "";
  if (oldLink && t.includes(oldLink)) return t.split(oldLink).join(sponsorLink);
  if (!t.trim()) return t;
  return `${t}\n${sponsorLink}`;
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

// ── 使用者自選贊助文（app_state：key=sponsor:pick:<accId>）──────
export interface SponsorPick {
  draftId: string;
  hour: number | null; // 指定發文時段（小時 0–23）；null = 該篇一發即贊助
}

function pickKey(accountId: string): string {
  return `sponsor:pick:${accountId}`;
}

export async function getSponsorPick(accountId: string): Promise<SponsorPick | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", pickKey(accountId)).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as SponsorPick;
  } catch {
    return null;
  }
}

export async function setSponsorPick(accountId: string, pick: SponsorPick | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  if (!pick) {
    await sb.from("app_state").delete().eq("key", pickKey(accountId));
    return;
  }
  await sb
    .from("app_state")
    .upsert({ key: pickKey(accountId), value: JSON.stringify(pick), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// ── 帳號臨時禁用贊助文（app_state：key=sponsor:optout:<accId>，值＝到期 ISO）──────
// 用途：活動檔期/商業合作期間，讓某帳號暫時不套贊助文；到期自動恢復（無需完全暫停發文）。
function optOutKey(accountId: string): string {
  return `sponsor:optout:${accountId}`;
}

// 回傳到期 ISO（仍在生效中）；已過期或未設回 null。
export async function getSponsorOptOutUntil(accountId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", optOutKey(accountId)).maybeSingle();
  const until = data?.value ?? null;
  if (!until) return null;
  const t = Date.parse(until);
  if (!Number.isFinite(t) || t <= Date.now()) return null; // 過期＝視同未設
  return until;
}

// 設定/清除：untilIso 為 null 或過去時間＝清除（恢復贊助）。
export async function setSponsorOptOut(accountId: string, untilIso: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  if (!untilIso || Date.parse(untilIso) <= Date.now()) {
    await sb.from("app_state").delete().eq("key", optOutKey(accountId));
    return;
  }
  await sb
    .from("app_state")
    .upsert({ key: optOutKey(accountId), value: untilIso, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

// 批次取多帳號的自選（草稿頁標示用）：回傳 accountId -> draftId。
export async function getSponsorPickMap(accountIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (isDemoMode || accountIds.length === 0) return out;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("key,value").in("key", accountIds.map(pickKey));
  for (const row of data ?? []) {
    try {
      const pick = JSON.parse(row.value) as SponsorPick;
      const accId = row.key.slice("sponsor:pick:".length);
      if (pick?.draftId) out[accId] = pick.draftId;
    } catch {
      // skip
    }
  }
  return out;
}

// ── 管理員贊助黑名單（app_state：key=sponsor:blocked:<accId>）──────
// 管理員可把濫用/高風險帳號永久排除贊助。改「每帳號一列」而非單一 JSON 陣列，
// 避免讀-改-寫整個陣列的併發競態（各帳號各自 upsert/delete，互不干擾）。
function blockedKey(accountId: string): string {
  return `sponsor:blocked:${accountId}`;
}

export async function getSponsorBlocklist(): Promise<string[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("key").like("key", "sponsor:blocked:%").limit(1000);
  return (data ?? []).map((r) => (r.key as string).slice("sponsor:blocked:".length)).filter(Boolean);
}

export async function setSponsorBlocked(accountId: string, blocked: boolean): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  if (blocked) {
    await sb
      .from("app_state")
      .upsert({ key: blockedKey(accountId), value: "1", updated_at: new Date().toISOString() }, { onConflict: "key" });
  } else {
    await sb.from("app_state").delete().eq("key", blockedKey(accountId));
  }
}

// ── 每日贊助紀錄（app_state：key=sponsor:rec:<accId>:<date>）──────
export interface SponsorRecord {
  postId: string;
  link: string;
  ownerId: string;
  at: string;
  verified?: boolean;
  violated?: boolean;
  deleted?: boolean; // 貼文已被使用者刪除/隱藏：視為正當下架（如蝦皮政策變動），不計違規
  ownLink?: boolean; // 高貢獻者選「換自己連結」：此篇用其自有分潤連結，非平台贊助，不納入違規驗證
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

// ── 累積贊助數（app_state：key=sponsor:total:<accId>）──────
// 累積比例判定用：不掃全部每日紀錄（昂貴），改維護一個每帳號累積計數器。
function totalKey(accountId: string): string {
  return `sponsor:total:${accountId}`;
}
export async function getSponsorTotal(accountId: string): Promise<number> {
  if (isDemoMode) return 0;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", totalKey(accountId)).maybeSingle();
  const n = data?.value ? parseInt(data.value, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
// 累加（RPC 難以對 app_state 泛用，改讀-加-寫；同帳號同輪序列化發文，競態極低）。
// newValue：呼叫端若已在本輪快取算出最新累積值，直接傳入以省一次 SELECT roundtrip。
export async function incrementSponsorTotal(accountId: string, newValue?: number): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const val = newValue !== undefined ? newValue : (await getSponsorTotal(accountId)) + 1;
  await sb
    .from("app_state")
    .upsert({ key: totalKey(accountId), value: String(val), updated_at: new Date().toISOString() }, { onConflict: "key" });
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

// 撈出「尚未驗證、且已發出超過 minAgeMs」的贊助紀錄（給驗證排程用）。逐列展開陣列、附 index。
export async function listSponsorRecordsToVerify(minAgeMs: number): Promise<SponsorRecordEntry[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("key,value").like("key", "sponsor:rec:%");
  const out: SponsorRecordEntry[] = [];
  for (const row of data ?? []) {
    const m = /^sponsor:rec:(.+):(\d{4}-\d{2}-\d{2})$/.exec(row.key);
    if (!m) continue;
    const recs = parseRecords(row.value);
    recs.forEach((rec, index) => {
      if (rec.verified) return;
      if (Date.now() - new Date(rec.at).getTime() < minAgeMs) return;
      out.push({ accountId: m[1], date: m[2], index, rec });
    });
  }
  return out;
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
