// 贊助文章驗證（功能 B 階段 3）：抓回已發的贊助文，確認平台分潤連結仍在；
// 被刪除或竄改 → 暫停該 Threads 帳號發文（恢復走帳號管理的手動啟用）。由 /api/cron/all 觸發。
import { listSponsorRecordsToVerify, setSponsorRecord } from "@/lib/sponsor";
import { getThreadsCredentials, setThreadsAccountStatus } from "@/lib/store";
import { getPostText } from "@/services/threads/verify";
import { sendUserAlert } from "@/lib/notify";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

const VERIFY_AFTER_MS = 2 * 3600_000; // 發出 2 小時後才驗（給使用者正常使用的緩衝）

export async function verifySponsorPosts(): Promise<{ checked: number; violations: number }> {
  const out = { checked: 0, violations: 0 };
  if (isDemoMode) return out;
  const entries = await listSponsorRecordsToVerify(VERIFY_AFTER_MS).catch(() => []);
  for (const { accountId, date, rec } of entries) {
    out.checked++;
    try {
      const creds = await getThreadsCredentials(accountId, rec.ownerId);
      if (!creds) continue; // 帳號已不存在 → 略過（不誤判暫停）
      const text = await getPostText(rec.postId, creds.accessToken);
      // text===null 代表貼文被刪/讀不到；否則檢查平台分潤連結是否仍在內文。
      const ok = text !== null && (rec.link ? text.includes(rec.link) : true);
      if (ok) {
        await setSponsorRecord(accountId, date, { ...rec, verified: true });
      } else {
        out.violations++;
        await setThreadsAccountStatus(accountId, rec.ownerId, "paused").catch((e) =>
          log.warn("暫停帳號失敗", { accountId, err: e })
        );
        await setSponsorRecord(accountId, date, { ...rec, verified: true, violated: true });
        await sendUserAlert(
          rec.ownerId,
          "⚠️ 你的贊助文章連結被移除或竄改，該帳號發文已暫停。請至帳號管理重新啟用（並遵守贊助文章規則）。"
        ).catch(() => {});
      }
    } catch (e) {
      log.warn("驗證贊助文發生錯誤", { accountId, err: e });
    }
  }
  return out;
}
