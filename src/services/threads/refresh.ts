// Threads 長期 token 自動展期 worker。
// 長期 token 約 60 天到期，到期前 7 天內自動 refresh，並把新 token + 到期日寫回。
// 展期失敗（多半因 token 已過期）→ 標記帳號 error，前端可見並停止排程。
import { refreshLongLivedToken } from "@/services/threads/token";
import { listThreadsTokensToRefresh, updateThreadsToken, markThreadsAccountError } from "@/lib/store";
import { log } from "@/lib/logger";

export async function refreshExpiringTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  details: { label: string; ok: boolean; error?: string }[];
}> {
  const accounts = await listThreadsTokensToRefresh();

  // 並行展期，避免帳號多時序列累加超過 maxDuration(60s)
  const details = await Promise.all(
    accounts.map(async (acc) => {
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
        return { label: acc.label, ok: false as const, error };
      }
    })
  );

  const refreshed = details.filter((d) => d.ok).length;
  const failed = details.length - refreshed;
  return { checked: accounts.length, refreshed, failed, details };
}
