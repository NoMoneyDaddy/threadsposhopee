import { log } from "@/lib/logger";

let running = false;

// 內建排程的一次心跳：以 HTTP 自呼 /api/cron/all（避免把重型 server 模組打進 instrumentation bundle）。
// 走同一支端點＝同一套邏輯與分布式鎖（多實例不重複發文）。防重入：上一輪未結束就跳過。
export async function schedulerTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const port = process.env.PORT || "3000";
    const secret = process.env.CRON_SECRET || "";
    const res = await fetch(`http://127.0.0.1:${port}/api/cron/all`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {}
    });
    if (!res.ok) log.warn("內建排程呼叫 /api/cron/all 非 2xx", { status: res.status });
  } catch (e) {
    log.warn("內建排程 tick 失敗", { err: e instanceof Error ? e.message : e });
  } finally {
    running = false;
  }
}
