// 內建排程：在常駐型主機（如 Zeabur 的 next start）讓 app 自己定時跑總排程，免設外部 cron。
// 預設開啟（opt-out）：常駐部署一上線就自動發文，零額外設定；分布式鎖確保多實例不重複發文。
// serverless（Vercel）不常駐、此機制不適用 → 設 INTERNAL_SCHEDULER=false 關閉，改用外部 cron。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { log } = await import("@/lib/logger");

  // 啟動期環境檢查：只驗已提供值的格式/配對（不中斷），提早暴露設定錯誤。
  const { env } = await import("@/lib/env");
  const { validateEnv } = await import("@/lib/env-validate");
  for (const issue of validateEnv(env, process.env.NODE_ENV === "production")) {
    log.warn("環境設定提醒", { issue });
  }

  if (process.env.INTERNAL_SCHEDULER === "false") return; // 預設開啟；明確設 false 才關（serverless）

  // parseInt + isFinite：避免非數字 env（如 "abc"）變 NaN 使 setInterval 近乎無延遲狂跑。
  const parsed = parseInt(process.env.INTERNAL_SCHEDULER_MINUTES || "15", 10);
  const minutes = Math.max(1, Number.isFinite(parsed) ? parsed : 15);
  const { schedulerTick } = await import("@/services/scheduler/tick");

  log.info("內建排程啟動", { everyMinutes: minutes });
  // 啟動後短延遲（≤30 秒，讓 server 先就緒）就先跑一次，之後才每 N 分一次。
  // 為何不「等一整個間隔」：每次重新部署都會重置 setInterval 計時器；若自動/頻繁重部署的間距
  // 比排程間隔還短，/api/cron/all 會遲遲不跑甚至停擺。先跑一次把重部署的損失壓到 ~30 秒內。
  // 安全：schedulerTick 有重入防護、/api/cron/all 有分布式鎖＋每日原子守門，多實例/重啟皆不重複。
  const initialDelayMs = Math.min(minutes * 60_000, 30_000);
  setTimeout(() => void schedulerTick(), initialDelayMs);
  setInterval(() => void schedulerTick(), minutes * 60_000);
}
