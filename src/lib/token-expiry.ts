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
  const daysLeft = Math.floor((t - now) / 86_400_000);
  if (daysLeft <= 0) return { level: "expired", daysLeft }; // 當天到期(0)亦視為已過期（契約：負或 0）
  if (daysLeft <= soonDays) return { level: "soon", daysLeft };
  return { level: "ok", daysLeft };
}
