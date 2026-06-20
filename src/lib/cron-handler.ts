import { NextResponse } from "next/server";
import { assertCron } from "./cron-auth";
import { sendAlert } from "./notify";
import { setHeartbeat } from "./store";
import { log } from "./logger";

// 4 個 cron 端點共用的外殼：驗證 → 跑 runner → 統一回應/告警。
// runner 回傳物件會展開進 JSON；alertWhen 可回傳告警字串（如有失敗）；
// 例外一律回 500 並送 Telegram 告警。
export function createCronHandler<T extends object>(
  label: string,
  runner: (req: Request) => Promise<T>,
  alertWhen?: (result: T) => string | null
) {
  return async function GET(req: Request) {
    const denied = assertCron(req);
    if (denied) return denied;
    try {
      const result = await runner(req);
      await setHeartbeat().catch((e) => log.warn("setHeartbeat 失敗", { label, err: e }));
      const warn = alertWhen?.(result);
      if (warn) await sendAlert(warn);
      return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sendAlert(`❌ ${label} cron 失敗：${msg}`);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  };
}
