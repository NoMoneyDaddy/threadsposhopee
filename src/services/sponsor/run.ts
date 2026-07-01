// 贊助文驗證（功能 B 階段 3）：抓回已發的贊助文，確認平台分潤連結仍在。
// 寬鬆：整篇被刪/隱藏＝正當下架（不罰）；僅「貼文還在但連結被移除/竄改」才累計違規，
// 達門檻才暫停該 Threads 帳號發文（恢復走帳號管理的手動啟用）。由 /api/cron/all 觸發。
import { listSponsorRecordsToVerify, updateSponsorRecordAt, setSponsorPenalty } from "@/lib/sponsor";
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
// 分級處罰：達 PENALTY 門檻 → 加重抽成懲罰期（不暫停、平台反而多賺，打在竄改者動機上）；
// 達更高的 HARD_PAUSE 門檻（極端/持續竄改）才停整個帳號（最後手段）。
const SPONSOR_PENALTY_LIMIT = 3; // 加權違規分達此 → 加重抽成
const SPONSOR_HARD_PAUSE_LIMIT = 6; // 加權違規分達此 → 停整個帳號（最後手段）
const PENALTY_DAYS = 14; // 加重抽成懲罰期天數（到期自動恢復）
const STRIKE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const STRIKE_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

// 取連結的穩定短碼（最後一段路徑），供「連結是否仍在」的寬鬆比對。純函式。
export function shortCodeOf(link: string): string {
  const base = link.split(/[?#]/)[0]; // 去查詢字串/錨點
  try {
    const u = new URL(base);
    return (u.pathname.split("/").filter(Boolean).pop() ?? "").trim();
  } catch {
    return (base.split("/").filter(Boolean).pop() ?? "").trim();
  }
}

// 驗證用寬鬆比對：判斷平台分潤連結是否仍存在於貼文，減少誤判為竄改。
// 只要「短碼」仍在文中即算保留——容忍尾斜線/查詢字串/協定/短連結自然失效重導等外觀差異
// （使用者沒動我們的連結，就不該被判違規）；僅短碼整個被移除/換掉才算蓄意竄改。純函式可測。
export function linkStillPresent(text: string, link: string | null | undefined): boolean {
  if (!link) return true;
  if (text.includes(link)) return true;
  const code = shortCodeOf(link);
  return code.length >= 4 && text.includes(code);
}

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
      const read = await getPostText(rec.postId, creds.accessToken);
      // 暫時讀不到（token 失效/限流/逾時）→ 不判定、不當下架、不扣分，維持未驗證留待下輪重試，
      // 避免因帳號 token 不健康就把真竄改誤放（原本 null 一律當下架的漏驗點）。
      if (read.status === "unreadable") continue;
      // 貼文確定不存在＝使用者正當下架（如蝦皮政策變動）：只記錄、不計違規、不扣 strike。
      if (read.status === "deleted") {
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true, deleted: true });
        continue;
      }
      const ok = linkStillPresent(read.text, rec.link);
      const strikeKey = `sponsor_strikes:${accountId}`;
      if (ok) {
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true });
        // 通過則衰減「一筆最舊違規」而非一次全清：寬鬆給改過機會，但反覆竄改者的加權分
        // 仍能穩定累積到門檻（避免穿插合規篇即永遠歸零、竄改零成本的漏洞）。
        const now = Date.now();
        const prevArr = (await getCachedJson<number[]>(strikeKey, STRIKE_WINDOW_MS).catch(() => [])) ?? [];
        const inWindow = (Array.isArray(prevArr) ? prevArr : [])
          .filter((t) => now - t < STRIKE_WINDOW_MS)
          .sort((a, b) => a - b);
        inWindow.shift(); // 移除最舊一筆（近期違規保留、仍會累積）
        await setCachedJson(strikeKey, inWindow).catch(() => {});
      } else {
        out.violations++;
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true, violated: true });
        const now = Date.now();
        const prevArr = (await getCachedJson<number[]>(strikeKey, STRIKE_WINDOW_MS).catch(() => [])) ?? [];
        const arr = [...(Array.isArray(prevArr) ? prevArr : []).filter((t) => now - t < STRIKE_WINDOW_MS), now];
        await setCachedJson(strikeKey, arr).catch(() => {});
        const strikes = weightedStrikes(arr, now); // 加權分（近期權重高）
        if (strikes >= SPONSOR_HARD_PAUSE_LIMIT) {
          // 最後手段：極端/持續竄改才停整個帳號（恢復走帳號管理手動啟用）。
          await setThreadsAccountStatus(accountId, rec.ownerId, "paused").catch((e) =>
            log.warn("暫停帳號失敗", { accountId, err: e })
          );
          await sendUserAlert(
            rec.ownerId,
            `⚠️ 你的贊助文連結持續被移除或竄改（違規加權 ${strikes}），已達最後手段：該帳號發文暫停。請至帳號管理重新啟用並遵守贊助文規則。`,
            "sponsor_violation"
          ).catch(() => {});
        } else if (strikes >= SPONSOR_PENALTY_LIMIT) {
          // 加重抽成懲罰期：帳號照常發文，但接下來 N 天贊助抽成加重（perPosts 除以 factor）。到期自動恢復。
          const factor = strikes >= 5 ? 3 : 2; // 分級：違規越重、抽越兇
          const untilIso = new Date(now + PENALTY_DAYS * 24 * 60 * 60 * 1000).toISOString();
          await setSponsorPenalty(accountId, factor, untilIso).catch((e) => log.warn("設定加重抽成失敗", { accountId, err: e }));
          await sendUserAlert(
            rec.ownerId,
            `⚠️ 你的贊助文連結被移除或竄改（違規加權 ${strikes}）。作為懲罰，接下來 ${PENALTY_DAYS} 天贊助抽成將加重約 ${factor} 倍（帳號照常發文，到期自動恢復）；若持續竄改才會暫停帳號。`,
            "sponsor_violation"
          ).catch(() => {});
        } else {
          // 未達門檻：只提醒。
          await sendUserAlert(
            rec.ownerId,
            `🔔 提醒：你的贊助文連結被移除或竄改（違規加權 ${strikes}/${SPONSOR_PENALTY_LIMIT}）。累計達門檻會加重贊助抽成，請遵守贊助文規則。`,
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
