// Threads 長期 token 自動展期 worker。
// 長期 token 約 60 天到期，到期前 7 天內自動 refresh，並把新 token + 到期日寫回。
// 展期失敗（多半因 token 已過期）→ 標記帳號 error，前端可見並停止排程。
import { refreshLongLivedToken } from "@/services/threads/token";
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
        await updateThreadsToken(acc.id, accessToken, expiresAt);
        return { label: acc.label, ok: true as const };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        // 標記失敗若又失敗需可見：否則帳號維持 active 會持續展期失敗、發文也跟著失敗。
        await markThreadsAccountError(acc.id).catch((me) =>
          log.warn("標記 Threads 帳號 error 失敗", { accountId: acc.id, accountLabel: acc.label, err: me })
        );
        // 個人通知：token 展期失敗＝該帳號將停止發文，推給帳號擁有者盡快重新授權。
        await sendUserAlert(
          acc.ownerId,
          `🔑 你的 Threads 帳號「${acc.label}」token 展期失敗，已暫停發文。請到帳號管理重新用 Threads 連結授權。`
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
