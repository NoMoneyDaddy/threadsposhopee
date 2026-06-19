import { refreshExpiringTokens } from "@/services/threads/refresh";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 每日展期即將到期的 Threads 長期 token。
export const GET = createCronHandler(
  "Token 展期",
  () => refreshExpiringTokens(),
  (r) => (r.failed > 0 ? `⚠️ Token 展期 ${r.failed} 個失敗，相關帳號已標記 error，請重新連結。` : null)
);
