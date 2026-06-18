// Threads 長期 token 自動展期 worker。
// 長期 token 約 60 天到期，到期前 7 天內自動 refresh，並把新 token + 到期日寫回。
// 展期失敗（多半因 token 已過期）→ 標記帳號 error，前端可見並停止排程。
import { refreshLongLivedToken } from "@/services/threads/token";
import { listThreadsTokensToRefresh, updateThreadsToken, markThreadsAccountError } from "@/lib/store";

export async function refreshExpiringTokens(): Promise<{
  checked: number;
  refreshed: number;
  failed: number;
  details: { label: string; ok: boolean; error?: string }[];
}> {
  const accounts = await listThreadsTokensToRefresh();
  const details: { label: string; ok: boolean; error?: string }[] = [];
  let refreshed = 0;
  let failed = 0;

  for (const acc of accounts) {
    try {
      const { accessToken, expiresInSec } = await refreshLongLivedToken(acc.accessToken);
      // 防禦 expires_in 缺失/NaN，預設 60 天
      const seconds = typeof expiresInSec === "number" && !Number.isNaN(expiresInSec) ? expiresInSec : 60 * 24 * 60 * 60;
      const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
      await updateThreadsToken(acc.id, accessToken, expiresAt);
      refreshed++;
      details.push({ label: acc.label, ok: true });
    } catch (e) {
      failed++;
      const error = e instanceof Error ? e.message : String(e);
      await markThreadsAccountError(acc.id).catch(() => {});
      details.push({ label: acc.label, ok: false, error });
    }
  }

  return { checked: accounts.length, refreshed, failed, details };
}
