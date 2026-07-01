// 贊助文驗證（功能 B 階段 3）：抓回已發的贊助文，確認平台分潤連結仍在。
// 寬鬆：整篇被刪/隱藏＝正當下架（不罰）；僅「貼文還在但連結被移除/竄改」才累計違規，
// 達門檻才暫停該 Threads 帳號發文（恢復走帳號管理的手動啟用）。由 /api/cron/all 觸發。
import { listSponsorRecordsToVerify, updateSponsorRecordAt } from "@/lib/sponsor";
import { getThreadsCredentials, setThreadsAccountStatus, getCachedJson, setCachedJson } from "@/lib/store";
import { getPostText } from "@/services/threads/verify";
import { sendUserAlert } from "@/lib/notify";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

const VERIFY_AFTER_MS = 2 * 3600_000; // 發出 2 小時後才驗（給使用者正常使用的緩衝）

// 註：比例制（B+A）上線後，已移除「冷門時段用管理員草稿自動補發贊助文」的機制
// （原 ensureSponsorPosts）。贊助文一律由發文佇列「就地改寫使用者自己的貼文」產生，配額依
// 使用者當日實際自發量計算（見 services/publish/sponsor-quota 與 queue.ts），低頻者不被強抽、
// 也不再有管理員內容被貼到他人帳號。本檔僅保留發後驗證。

// 違規寬鬆化＋加權：單次竄改不立即暫停，累計「加權分」達門檻才暫停。
// 加權：近 7 天的違規每次計 2 分、7–30 天每次計 1 分（近期反覆竄改更快觸發、舊違規自然淡出）。
// strike 以「違規時間戳陣列（30 天滾動窗）」存於 app_state。連結驗證通過即清零。
const SPONSOR_VIOLATION_LIMIT = 3;
const STRIKE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const STRIKE_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

// 依時間戳陣列算加權違規分（近期權重高）。純函式。
export function weightedStrikes(timestamps: number[], now: number): number {
  return timestamps.reduce((sum, t) => {
    const age = now - t;
    if (age < 0 || age >= STRIKE_WINDOW_MS) return sum; // 視窗外不計
    return sum + (age < STRIKE_RECENT_MS ? 2 : 1);
  }, 0);
}

export async function verifySponsorPosts(): Promise<{ checked: number; violations: number }> {
  const out = { checked: 0, violations: 0 };
  if (isDemoMode) return out;
  const entries = await listSponsorRecordsToVerify(VERIFY_AFTER_MS).catch(() => []);
  for (const { accountId, date, index, rec } of entries) {
    out.checked++;
    try {
      if (rec.ownLink) continue; // 高貢獻者用自己連結的贊助文：非平台分潤，不做連結驗證/裁罰
      const creds = await getThreadsCredentials(accountId, rec.ownerId);
      if (!creds) continue; // 帳號已不存在 → 略過（不誤判暫停）
      const text = await getPostText(rec.postId, creds.accessToken);
      // 寬鬆處理：整篇被刪/隱藏/讀不到（text===null）＝使用者正當下架（如蝦皮政策變動），
      // 只記錄、不計違規、不扣 strike；僅「貼文還在但連結被移除/竄改」才算蓄意違規。
      if (text === null) {
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true, deleted: true });
        continue;
      }
      const ok = rec.link ? text.includes(rec.link) : true;
      const strikeKey = `sponsor_strikes:${accountId}`;
      if (ok) {
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true });
        // 通過則清零累計違規（寬鬆：給機會重新累積）
        await setCachedJson(strikeKey, []).catch(() => {});
      } else {
        out.violations++;
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true, violated: true });
        const now = Date.now();
        const prevArr = (await getCachedJson<number[]>(strikeKey, STRIKE_WINDOW_MS).catch(() => [])) ?? [];
        const arr = [...(Array.isArray(prevArr) ? prevArr : []).filter((t) => now - t < STRIKE_WINDOW_MS), now];
        await setCachedJson(strikeKey, arr).catch(() => {});
        const strikes = weightedStrikes(arr, now); // 加權分（近期權重高）
        if (strikes >= SPONSOR_VIOLATION_LIMIT) {
          // 累計達上限才暫停（恢復走帳號管理手動啟用）
          await setThreadsAccountStatus(accountId, rec.ownerId, "paused").catch((e) =>
            log.warn("暫停帳號失敗", { accountId, err: e })
          );
          await sendUserAlert(
            rec.ownerId,
            `⚠️ 你的贊助文連結多次被移除或竄改（近期違規加權已達上限），該帳號發文已暫停。請至帳號管理重新啟用並遵守贊助文規則。`,
            "sponsor_violation"
          ).catch(() => {});
        } else {
          // 未達上限：只提醒、不暫停
          await sendUserAlert(
            rec.ownerId,
            `🔔 提醒：你的贊助文連結被移除或竄改（違規加權 ${strikes}/${SPONSOR_VIOLATION_LIMIT}，近期違規權重較高）。達上限才會暫停發文，請遵守贊助文規則。`,
            "sponsor_violation"
          ).catch(() => {});
        }
      }
    } catch (e) {
      log.warn("驗證贊助文發生錯誤", { accountId, err: e });
    }
  }
  return out;
}
