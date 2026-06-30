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
  // 啟動後先等一輪，避免部署/冷啟動瞬間爭用；之後每 N 分一次。
  setInterval(() => void schedulerTick(), minutes * 60_000);
}
