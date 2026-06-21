// Threads 長期 token 自動展期 worker。
// 長期 token 約 60 天到期，到期前 7 天內自動 refresh，並把新 token + 到期日寫回。
// 展期失敗且「token 確定失效」→ 標記帳號 error；暫時性錯誤（5xx/限流/網路/逾時）僅記錄、下輪重試。
import { refreshLongLivedToken, ThreadsTokenError, isPermanentTokenError } from "@/services/threads/token";
import { listThreadsTokensToRefresh, updateThreadsToken, markThreadsAccountError } from "@/lib/store";
import { sendUserAlert } from "@/lib/notify";
import { log } from "@/lib/logger";

export async function refreshExpiringTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  details: { label: string; ok: boolean; error?: string }[];
}> {
  const accounts = await listThreadsTokensToRefresh();

  // 分批並行展期：兼顧 maxDuration(60s) 與「不一次轟爆 Threads API 觸發限流」。
  // 同批內 Promise.all、批與批之間序列，並發上限 = REFRESH_CONCURRENCY。
  const REFRESH_CONCURRENCY = 5;
  const refreshOne = async (acc: (typeof accounts)[number]) => {
    try {
      const { accessToken, expiresInSec } = await refreshLongLivedToken(acc.accessToken);
      if (!accessToken) throw new Error("API 回傳的 accessToken 為空");
      // 防禦 expires_in 缺失/NaN/非正數，預設 60 天
      const seconds =
        typeof expiresInSec === "number" && !Number.isNaN(expiresInSec) && expiresInSec > 0
          ? expiresInSec
          : 60 * 24 * 60 * 60;
      const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
      await updateThreadsToken(acc.id, accessToken, expiresAt, acc.ownerId);
      return { label: acc.label, ok: true as const };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      // 暫時性錯誤（5xx/限流/網路/逾時，無明確失效狀態）：不誤標 error、不通知，留待下輪重試。
      // 否則一次 Threads 暫時性故障就把仍有效的帳號打成 error、發出誤導的「需重新授權」。
      const permanent = e instanceof ThreadsTokenError && isPermanentTokenError(e.status);
      if (!permanent) {
        log.warn("Threads token 展期暫時性失敗，下輪重試", { accountId: acc.id, accountLabel: acc.label, err: error });
        return { label: acc.label, ok: false as const, error };
      }
      // token 確定失效：標 error（停止排程）＋通知擁有者重新授權。
      await markThreadsAccountError(acc.id, acc.ownerId).catch((me) =>
        log.warn("標記 Threads 帳號 error 失敗", { accountId: acc.id, accountLabel: acc.label, err: me })
      );
      await sendUserAlert(
        acc.ownerId,
        `🔑 你的 Threads 帳號「${acc.label}」連線授權已失效，已暫停發文。請到帳號管理重新連結 Threads。`,
        "token_expiring"
      ).catch(() => {});
      return { label: acc.label, ok: false as const, error };
    }
  };

  const details: { label: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < accounts.length; i += REFRESH_CONCURRENCY) {
    const batch = accounts.slice(i, i + REFRESH_CONCURRENCY);
    details.push(...(await Promise.all(batch.map(refreshOne))));
  }

  const refreshed = details.filter((d) => d.ok).length;
  const failed = details.length - refreshed;
  return { checked: accounts.length, refreshed, failed, details };
}
