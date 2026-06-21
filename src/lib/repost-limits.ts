// 同素材重複發文上限（純定義＋輸入正規化；DB 讀寫在 credentials.ts）。
// 0＝不限制。perAccount：同一素材於單一帳號的上限；total：跨所有帳號合計上限。
export interface RepostLimits {
  perAccount: number; // 0 = 不限
  total: number; // 0 = 不限
}

export const REPOST_LIMIT_MAX = 999; // 防呆上界（避免誤填天文數字）

// 把表單輸入（字串/數字）夾成合法整數；空白／非數字／負數一律視為 0（不限）。
export function normalizeRepostLimitsInput(body: unknown):
  | { ok: true; perAccount: number; total: number }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const parse = (v: unknown): number | null => {
    if (v === "" || v === null || v === undefined) return 0;
    const n = typeof v === "number" ? v : parseInt(String(v).trim(), 10);
    if (!Number.isFinite(n)) return null;
    return n;
  };
  const perAccount = parse(b.perAccount);
  const total = parse(b.total);
  if (perAccount === null || total === null) return { ok: false, error: "上限需為數字" };
  if (perAccount < 0 || total < 0) return { ok: false, error: "上限不可為負數" };
  if (perAccount > REPOST_LIMIT_MAX || total > REPOST_LIMIT_MAX) {
    return { ok: false, error: `上限不可超過 ${REPOST_LIMIT_MAX}` };
  }
  return { ok: true, perAccount, total };
}

// 判斷「再排一篇」是否會超過上限。current 為「該素材目前已排入／已發布」的計數。
export function exceedsRepostLimit(
  limits: RepostLimits,
  current: { perAccount: number; total: number }
): { blocked: boolean; reason?: string } {
  if (limits.perAccount > 0 && current.perAccount >= limits.perAccount) {
    return { blocked: true, reason: `已達同帳號重複發文上限（${limits.perAccount} 次）` };
  }
  if (limits.total > 0 && current.total >= limits.total) {
    return { blocked: true, reason: `已達跨帳號重複發文上限（${limits.total} 次）` };
  }
  return { blocked: false };
}
