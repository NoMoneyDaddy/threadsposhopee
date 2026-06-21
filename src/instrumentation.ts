// 內建排程（選用）：在常駐型主機（如 Zeabur 的 next start）讓 app 自己定時跑總排程，
// 免設外部 cron。serverless（Vercel）不會常駐 → 此機制不啟動，仍用外部 cron。
// 以 INTERNAL_SCHEDULER=true 開啟；分布式鎖確保多實例不重複發文。
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.INTERNAL_SCHEDULER !== "true") return;

  const minutes = Math.max(1, Number(process.env.INTERNAL_SCHEDULER_MINUTES || "15"));
  const { schedulerTick } = await import("@/services/scheduler/tick");
  const { log } = await import("@/lib/logger");

  log.info("內建排程啟動", { everyMinutes: minutes });
  // 啟動後先等一輪，避免部署/冷啟動瞬間爭用；之後每 N 分一次。
  setInterval(() => void schedulerTick(), minutes * 60_000);
}
