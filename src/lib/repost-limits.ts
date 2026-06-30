// 同素材重複發文上限（純定義＋輸入正規化；DB 讀寫在 credentials.ts）。
// 0＝不限制。perAccount：同一素材於單一帳號的上限；total：跨所有帳號合計上限。
export interface RepostLimits {
  perAccount: number; // 0 = 不限
  total: number; // 0 = 不限
  evergreenDays: number; // 常青回收間隔（天）；0 = 沿用系統預設（EVERGREEN_MIN_DAYS）
}

export const REPOST_LIMIT_MAX = 999; // 防呆上界（避免誤填天文數字）
export const EVERGREEN_DAYS_MAX = 365; // 常青回收間隔上界（1 年）；0＝用系統預設

// 把表單輸入（字串/數字）夾成合法整數；空白／非數字／負數一律視為 0（不限）。
export function normalizeRepostLimitsInput(body: unknown):
  | { ok: true; perAccount: number; total: number; evergreenDays: number }
  | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const parse = (v: unknown): number | null => {
    if (v === "" || v === null || v === undefined) return 0;
    // 僅接受字串/數字：擋 [3]、{}等經隱式 String() 轉型繞過驗證。
    if (typeof v !== "string" && typeof v !== "number") return null;
    // Number 而非 parseInt：parseInt("3.9")→3、"5abc"→5 會靜默截斷接受非整數輸入。
    const n = typeof v === "number" ? v : Number(v.trim());
    if (!Number.isInteger(n)) return null;
    return n;
  };
  const perAccount = parse(b.perAccount);
  const total = parse(b.total);
  const evergreenDays = parse(b.evergreenDays);
  if (perAccount === null || total === null || evergreenDays === null) return { ok: false, error: "數值需為整數" };
  if (perAccount < 0 || total < 0 || evergreenDays < 0) return { ok: false, error: "數值不可為負數" };
  if (perAccount > REPOST_LIMIT_MAX || total > REPOST_LIMIT_MAX) {
    return { ok: false, error: `上限不可超過 ${REPOST_LIMIT_MAX}` };
  }
  if (evergreenDays > EVERGREEN_DAYS_MAX) {
    return { ok: false, error: `常青回收間隔不可超過 ${EVERGREEN_DAYS_MAX} 天（0＝用預設）` };
  }
  return { ok: true, perAccount, total, evergreenDays };
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
