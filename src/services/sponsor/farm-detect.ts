// R2-E 多帳號農場偵測（唯讀）：以 owner 為單位聚合贊助行為，標出「疑似用多帳號規避贊助」的使用者供管理員人工審查。
// 明確不做的事：不做裝置/IP 指紋（本系統無此資料），不自動懲罰（避免誤判真實多品牌經營者）。
// 純訊號：帳號數 × 規避傾向（永久不抽/違規罰則/被封鎖/欠抽），全部來自既有 sponsor_account_stats 與 owner 欠抽。
import { getServiceClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";

export interface FarmSuspectInput {
  accountCount: number;
  permanentOffCount: number; // 永久「完全不抽」帳號數
  penalizedCount: number; // 違規加重抽成生效中帳號數
  blockedCount: number; // 管理員黑名單帳號數
  optOutCount: number; // 任何禁用（含臨時/減半）帳號數
  ownerDebt: number; // 目前欠抽（永久不抽轉嫁、尚未由其他帳號補還）
}

export interface FarmSuspect extends FarmSuspectInput {
  ownerId: string;
  reasons: string[];
}

// 判定門檻（保守，寧可漏報不誤報；純供人工審查，不自動裁罰）。
export const FARM_MIN_ACCOUNTS = 4; // 少於此帳號數不視為農場（正常人可有數個帳號）
const EVASION_RATIO = 0.5; // 規避帳號（永久不抽＋罰則＋封鎖）佔比達此值即可疑
const HIGH_DEBT = 5; // 欠抽達此值（＝發文佇列 OWNER_DEBT_CAP）代表長期沒在還

// 純函式：依聚合計數判定是否可疑並給出原因（可單測）。
export function evaluateFarm(input: FarmSuspectInput): { suspect: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.accountCount < FARM_MIN_ACCOUNTS) return { suspect: false, reasons };
  const evasive = input.permanentOffCount + input.penalizedCount + input.blockedCount;
  const ratio = input.accountCount > 0 ? evasive / input.accountCount : 0;
  if (ratio >= EVASION_RATIO) {
    reasons.push(`${input.accountCount} 個帳號中 ${evasive} 個處於規避狀態（永久不抽/違規罰則/封鎖，佔 ${Math.round(ratio * 100)}%）`);
  }
  if (input.blockedCount >= 2) reasons.push(`${input.blockedCount} 個帳號已被列入黑名單`);
  if (input.penalizedCount >= 2) reasons.push(`${input.penalizedCount} 個帳號正被加重抽成（近期違規）`);
  if (input.ownerDebt >= HIGH_DEBT) reasons.push(`累積欠抽達 ${input.ownerDebt}（永久不抽份額長期未由其他帳號補還）`);
  return { suspect: reasons.length > 0, reasons };
}

interface StatsRow {
  threads_user_id: string;
  blocked: boolean | null;
  penalty_factor: number | string | null;
  penalty_until: string | null;
  optout: { mode?: string; permanent?: boolean; until?: string | null } | null;
}

function penaltyActive(factor: number | string | null, until: string | null): boolean {
  const t = Date.parse(String(until ?? ""));
  return Number.isFinite(t) && t > Date.now() && Number(factor) > 1;
}
function optOutActive(o: StatsRow["optout"]): { active: boolean; permanentOff: boolean } {
  if (!o) return { active: false, permanentOff: false };
  if (o.permanent) return { active: true, permanentOff: o.mode !== "half" };
  const t = Date.parse(String(o.until ?? ""));
  const active = Number.isFinite(t) && t > Date.now();
  return { active, permanentOff: false };
}

// 掃描所有使用者、聚合並回傳疑似農場（依原因數多→少排序）。exclude：平台 owner（自家帳號不適用贊助）。
export async function listSuspectedSponsorFarms(excludeOwnerId?: string | null): Promise<FarmSuspect[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  // 1) 所有發文帳號的 (owner_id, threads_user_id)。
  const { data: accts, error: aErr } = await sb.from("threads_accounts").select("owner_id, threads_user_id");
  if (aErr) throw new Error(`讀取帳號清單失敗：${aErr.message}`);
  // 2) 所有贊助帳號狀態。
  const { data: stats, error: sErr } = await sb
    .from("sponsor_account_stats")
    .select("threads_user_id, blocked, penalty_factor, penalty_until, optout");
  if (sErr) throw new Error(`讀取贊助帳號狀態失敗：${sErr.message}`);
  const statsByTuid = new Map<string, StatsRow>();
  for (const r of (stats as StatsRow[] | null) ?? []) statsByTuid.set(r.threads_user_id, r);
  // 3) 各 owner 欠抽（app_state：sponsor:redebt:<ownerId>）。
  const debtByOwner = new Map<string, number>();
  const { data: debts } = await sb.from("app_state").select("key, value").like("key", "sponsor:redebt:%").limit(5000);
  for (const row of debts ?? []) {
    const oid = (row.key as string).slice("sponsor:redebt:".length);
    const n = parseInt(String(row.value ?? "0"), 10);
    if (oid) debtByOwner.set(oid, Number.isFinite(n) ? Math.max(0, n) : 0);
  }

  // 依 owner 聚合。
  const byOwner = new Map<string, FarmSuspectInput>();
  for (const a of (accts as { owner_id: string; threads_user_id: string }[] | null) ?? []) {
    if (!a.owner_id || (excludeOwnerId && a.owner_id === excludeOwnerId)) continue;
    const agg = byOwner.get(a.owner_id) ?? { accountCount: 0, permanentOffCount: 0, penalizedCount: 0, blockedCount: 0, optOutCount: 0, ownerDebt: debtByOwner.get(a.owner_id) ?? 0 };
    agg.accountCount += 1;
    const s = statsByTuid.get(a.threads_user_id);
    if (s) {
      if (s.blocked) agg.blockedCount += 1;
      if (penaltyActive(s.penalty_factor, s.penalty_until)) agg.penalizedCount += 1;
      const oo = optOutActive(s.optout);
      if (oo.active) agg.optOutCount += 1;
      if (oo.permanentOff) agg.permanentOffCount += 1;
    }
    byOwner.set(a.owner_id, agg);
  }

  const out: FarmSuspect[] = [];
  for (const [ownerId, agg] of byOwner) {
    const { suspect, reasons } = evaluateFarm(agg);
    if (suspect) out.push({ ownerId, ...agg, reasons });
  }
  return out.sort((a, b) => b.reasons.length - a.reasons.length || b.accountCount - a.accountCount);
}
