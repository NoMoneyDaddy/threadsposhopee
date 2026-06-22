// 每週收益週報「廣播」：發給每位有綁通知通道的會員，各收自己的數據（不再只有 owner）。
// 由總排程在每週一視窗觸發。以 app_state 做每會員去重（6 天窗 < 7 天週期），多 tick／中斷可續發、不重複。
import { isDemoMode } from "@/lib/env";
import { listOwnersWithNotify, getCachedJson, setCachedJson } from "@/lib/store";
import { sendUserAlert } from "@/lib/notify";
import { buildPeriodicDigestForOwner } from "./periodic";
import { log } from "@/lib/logger";

const DEDUPE_MS = 6 * 86400_000; // 本週已送過則略過（短於 7 天週期，下週自動再送）
const TIME_BUDGET_MS = 45_000; // 守 cron maxDuration

export async function broadcastWeeklyDigests(): Promise<{ sent: number; skipped: number }> {
  const out = { sent: 0, skipped: 0 };
  if (isDemoMode) return out;
  const ids = await listOwnersWithNotify(500).catch((e) => {
    log.error("列出週報收件會員失敗", { err: e });
    return [] as string[];
  });
  const start = Date.now();
  for (const id of ids) {
    if (Date.now() - start > TIME_BUDGET_MS) break; // 時間到，剩下的下個 tick 續送（去重防重複）
    const key = `wdigest:${id}`;
    try {
      if (await getCachedJson<number>(key, DEDUPE_MS)) {
        out.skipped++;
        continue;
      }
      // 只有「成功取得內容」才標記本週已處理；buildPeriodicDigestForOwner 僅在錯誤時回 null
      //（無貼文仍會回「已發布 0 篇」字串），故 null＝暫時性錯誤，留待下個 tick 重試、不寫快取。
      const msg = await buildPeriodicDigestForOwner(id, "本週", 7).catch(() => null);
      if (!msg) continue;
      await sendUserAlert(id, msg, "weekly_digest");
      await setCachedJson(key, Date.now());
      out.sent++;
    } catch (e) {
      log.warn("發送會員週報失敗", { ownerId: id, err: e });
    }
  }
  return out;
}
