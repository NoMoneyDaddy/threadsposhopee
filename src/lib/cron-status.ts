// 排程心跳狀態（純函式，易測）：把上次 cron 心跳時間映射成顯示用 {tone, text}。
// 防呆：非法/不可解析時間戳、未來時間都回 warning，不誤顯示「運轉中」或 NaN。
// 用毫秒差與 floor 判斷新鮮度（避免 Math.round 在 30 分鐘臨界點四捨五入誤判）。
export interface CronStatus {
  tone: string;
  text: string;
}

const STALE_MS = 30 * 60_000; // 超過 30 分鐘無心跳視為停擺

export function cronHeartbeatStatus(lastCronAt: string | null, nowMs: number): CronStatus {
  if (!lastCronAt) return { tone: "text-ink-3", text: "尚未偵測到排程執行（自動駕駛未開啟）" };
  const ts = Date.parse(lastCronAt);
  if (!Number.isFinite(ts)) return { tone: "text-amber-600", text: "⚠️ 排程心跳資料格式無效" };
  const diffMs = nowMs - ts;
  if (diffMs < 0) return { tone: "text-amber-600", text: "⚠️ 排程心跳時間異常（在未來）" };
  const mins = Math.floor(diffMs / 60_000);
  const ago = mins < 1 ? "剛剛" : mins < 60 ? `${mins} 分鐘前` : `${Math.floor(mins / 60)} 小時前`;
  return diffMs > STALE_MS
    ? { tone: "text-amber-600", text: `⚠️ 排程似乎停了（上次執行 ${ago}）` }
    : { tone: "text-green-600", text: `🚀 自動駕駛運轉中 — 上次執行 ${ago}` };
}
