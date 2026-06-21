// 方案分層（商業化基礎）：以「可連結的 Threads 發文帳號數」為計費維度。
// 純設定 + 取值，無副作用（不碰 DB）；profiles 只存 plan 字串，限額一律查此表得出，
// 日後調整級距不需資料遷移。
export type PlanId = "free" | "pro" | "business";

export interface PlanLimits {
  // 可連結的 Threads 發文帳號上限
  maxThreadsAccounts: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: { maxThreadsAccounts: 1 },
  pro: { maxThreadsAccounts: 10 },
  business: { maxThreadsAccounts: 50 }
};

// 全站每人綁定 Threads 帳號硬上限（含管理者）：資源保護，避免單人爆量造成排隊。
export const GLOBAL_MAX_THREADS_ACCOUNTS = 20;

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "免費版",
  pro: "專業版",
  business: "商務版"
};

const PLAN_IDS = Object.keys(PLANS) as PlanId[];

// 容錯：未知／缺值一律當 free（最保守，避免誤放行更高額度）。
export function normalizePlan(plan: unknown): PlanId {
  return typeof plan === "string" && (PLAN_IDS as string[]).includes(plan) ? (plan as PlanId) : "free";
}

export function planLimits(plan: unknown): PlanLimits {
  return PLANS[normalizePlan(plan)];
}
