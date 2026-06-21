// Threads 長期 token 到期狀態：自動展期在到期前 7 天觸發；若 cron 沒跑或已過期，
// 操作者需要明顯警示。純函式，給帳號頁與儀表板共用。
export type TokenExpiryLevel = "ok" | "soon" | "expired" | "unknown";

export interface TokenExpiryState {
  level: TokenExpiryLevel;
  daysLeft: number | null; // 無到期日 → null；已過期 → 負或 0
}

// soonDays：到期前幾天內視為「即將到期」（與展期視窗一致，預設 7）。
export function tokenExpiryState(iso: string | null | undefined, soonDays = 7, now = Date.now()): TokenExpiryState {
  if (!iso) return { level: "unknown", daysLeft: null };
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return { level: "unknown", daysLeft: null };
  const ms = t - now;
  // 以毫秒判定是否過期：尚未到期者（即使剩不到一天）不得誤判 expired。
  // （舊版用 Math.floor 天數<=0，剩 23h→floor=0→誤判 expired，提早一天把好帳號打成 error。）
  if (ms <= 0) return { level: "expired", daysLeft: Math.floor(ms / 86_400_000) }; // 0 或負（floor 避免 -0）
  // 顯示用剩餘天數：無條件進位（剩 23h 顯示「1 天」而非 0，且不低估）。
  const daysLeft = Math.ceil(ms / 86_400_000);
  if (daysLeft <= soonDays) return { level: "soon", daysLeft };
  return { level: "ok", daysLeft };
}
