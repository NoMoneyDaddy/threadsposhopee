// 每日刷新各 Threads 帳號的個人檔案（顯示名稱／頭像）。
// 原因：Threads 的 threads_profile_picture_url 是會過期的簽名 CDN 連結，綁定當下抓一次存著、
// 久了會失效（草稿預覽、帳號頁頭像變灰圈）。每日重抓並寫回，讓頭像保持有效。
// 抓檔失敗（暫時性）只略過該帳號、不清空既有資料、不影響其他帳號。
import { getThreadsProfile } from "@/services/threads/oauth";
import { listActiveThreadsTokensAll, updateThreadsAccountProfile } from "@/lib/store";
import { log } from "@/lib/logger";

export async function refreshThreadsProfiles(): Promise<{ checked: number; refreshed: number; failed: number }> {
  const accounts = await listActiveThreadsTokensAll();
  const CONCURRENCY = 5;
  let refreshed = 0;
  let failed = 0;

  const refreshOne = async (acc: (typeof accounts)[number]) => {
    try {
      const profile = await getThreadsProfile(acc.accessToken);
      // 只寫有值的欄位；avatarUrl 為空（抓不到）時不覆蓋既有，避免把有效頭像清成 null。
      await updateThreadsAccountProfile(acc.id, acc.ownerId, {
        display_name: profile.name ?? undefined,
        avatar_url: profile.avatarUrl || undefined
      });
      refreshed++;
    } catch (e) {
      failed++;
      log.warn("Threads 個人檔案刷新失敗（下次再試）", { accountId: acc.id, accountLabel: acc.label, err: e instanceof Error ? e.message : e });
    }
  };

  for (let i = 0; i < accounts.length; i += CONCURRENCY) {
    await Promise.all(accounts.slice(i, i + CONCURRENCY).map(refreshOne));
  }
  return { checked: accounts.length, refreshed, failed };
}
