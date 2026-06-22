// 贊助文章設定（功能 B）：owner 設定要替換進贊助文的平台分潤連結、冷門時段與開關。
// 存 app_state 單列（key=sponsor_config），demo 走預設值。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

export interface SponsorConfig {
  enabled: boolean;
  productUrl: string; // 商品原始連結；系統據此用 owner 金鑰即時轉「每帳號 subId」分潤連結（可追來源）
  affiliateLink: string; // 後備：靜態分潤短連結（無法每帳號追蹤；productUrl 為空時才用）
  offPeakStart: number; // 冷門時段起（小時 0–23，Asia/Taipei）
  offPeakEnd: number; // 冷門時段迄（小時 0–24）
}

const KEY = "sponsor_config";
export const DEFAULT_SPONSOR_CONFIG: SponsorConfig = {
  enabled: false,
  productUrl: "",
  affiliateLink: "",
  offPeakStart: 2,
  offPeakEnd: 5
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
// - 啟用、非 owner 帳號、今天尚未做過為前提。
// - 使用者自選一篇（pickDraftId）：只認那一篇；有指定時段（pickHour）則限該時，否則一發即贊助。
// - 未自選：落在冷門時段的當篇自動成為贊助文。
export function shouldSponsor(opts: {
  enabled: boolean;
  isOwnerAccount: boolean;
  hour: number;
  offPeakStart: number;
  offPeakEnd: number;
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
  return inOffPeak(opts.hour, opts.offPeakStart, opts.offPeakEnd);
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

// ── 每日贊助紀錄（app_state：key=sponsor:rec:<accId>:<date>）──────
export interface SponsorRecord {
  postId: string;
  link: string;
  ownerId: string;
  at: string;
  verified?: boolean;
  violated?: boolean;
  ownLink?: boolean; // 高貢獻者選「換自己連結」：此篇用其自有分潤連結，非平台贊助，不納入違規驗證
}

function recKey(accountId: string, date: string): string {
  return `sponsor:rec:${accountId}:${date}`;
}

export async function getSponsorRecord(accountId: string, date: string): Promise<SponsorRecord | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("value").eq("key", recKey(accountId, date)).maybeSingle();
  if (!data?.value) return null;
  try {
    return JSON.parse(data.value) as SponsorRecord;
  } catch {
    return null;
  }
}

export async function setSponsorRecord(accountId: string, date: string, rec: SponsorRecord): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  await sb
    .from("app_state")
    .upsert({ key: recKey(accountId, date), value: JSON.stringify(rec), updated_at: new Date().toISOString() }, { onConflict: "key" });
}

export interface SponsorRecordEntry {
  accountId: string;
  date: string;
  rec: SponsorRecord;
}

// 撈出「尚未驗證、且已發出超過 minAgeMs」的贊助紀錄（給驗證排程用）。
export async function listSponsorRecordsToVerify(minAgeMs: number): Promise<SponsorRecordEntry[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb.from("app_state").select("key,value").like("key", "sponsor:rec:%");
  const out: SponsorRecordEntry[] = [];
  for (const row of data ?? []) {
    try {
      const rec = JSON.parse(row.value) as SponsorRecord;
      if (rec.verified) continue;
      if (Date.now() - new Date(rec.at).getTime() < minAgeMs) continue;
      const m = /^sponsor:rec:(.+):(\d{4}-\d{2}-\d{2})$/.exec(row.key);
      if (!m) continue;
      out.push({ accountId: m[1], date: m[2], rec });
    } catch {
      // 壞資料略過
    }
  }
  return out;
}

// 正規化＋驗證輸入（小時界線、連結需為 http(s)）。回傳清理後設定或錯誤訊息。
export function normalizeSponsorConfig(input: Partial<SponsorConfig>): { ok: true; cfg: SponsorConfig } | { ok: false; error: string } {
  const enabled = Boolean(input.enabled);
  const productUrl = String(input.productUrl ?? "").trim();
  const affiliateLink = String(input.affiliateLink ?? "").trim();
  const offPeakStart = Number(input.offPeakStart);
  const offPeakEnd = Number(input.offPeakEnd);
  const isUrl = (s: string) => /^https?:\/\//i.test(s);
  if (productUrl && !isUrl(productUrl)) return { ok: false, error: "商品原始連結需為 http/https" };
  if (affiliateLink && !isUrl(affiliateLink)) return { ok: false, error: "後備分潤連結需為 http/https" };
  // 啟用時：商品原始連結（可每帳號追蹤，建議）或後備靜態分潤連結，至少要有一個。
  if (enabled && !productUrl && !affiliateLink) {
    return { ok: false, error: "啟用時請填商品原始連結（建議）或後備分潤連結，至少一項" };
  }
  if (!Number.isInteger(offPeakStart) || !Number.isInteger(offPeakEnd) || offPeakStart < 0 || offPeakStart > 23 || offPeakEnd < 1 || offPeakEnd > 24 || offPeakStart >= offPeakEnd) {
    return { ok: false, error: "冷門時段需為 0–24 的整數且起 < 迄" };
  }
  return { ok: true, cfg: { enabled, productUrl, affiliateLink, offPeakStart, offPeakEnd } };
}
