// 發後讀回自動驗證（保守版）：對 needs_verification 草稿，讀回該帳號近期貼文比對文案。
// 高信心吻合 → 確定「已發出」→ 標 published、回填 postId（有留言則交給延遲留言流程補）。
// 找不到吻合 → 維持 needs_verification 交人工（絕不自動重發，零重複貼文風險）。
import { listNeedsVerificationAll, updateDraftStatusAtomic } from "@/lib/store";
import { getThreadsCredentials } from "@/lib/accounts-store";
import { listRecentThreadsPosts } from "@/services/threads/verify";
import { textSimilarity } from "@/lib/text-similarity";
import type { Draft } from "@/lib/types";

const MATCH_THRESHOLD = 0.7; // 文案相似度達此值視為「同一篇、確實已發出」
const MAX_PER_RUN = 30;

export async function reconcileNeedsVerification(): Promise<{ resolved: number; checked: number }> {
  const drafts = await listNeedsVerificationAll(MAX_PER_RUN).catch(() => []);
  if (drafts.length === 0) return { resolved: 0, checked: 0 };

  // 以帳號為單位快取近期貼文，避免同帳號重複抓。
  const recentByAccount = new Map<string, { id: string; text: string }[]>();
  let resolved = 0;
  let checked = 0;

  for (const d of drafts) {
    const ownerId = d.owner_id;
    const accountId = d.threads_account_id;
    const text = d.main_text;
    if (!ownerId || !accountId || !text) continue;
    checked++;

    let posts = recentByAccount.get(accountId);
    if (!posts) {
      const creds = await getThreadsCredentials(accountId, ownerId).catch(() => null);
      if (!creds) continue;
      posts = await listRecentThreadsPosts(creds.threadsUserId, creds.accessToken).catch(() => []);
      recentByAccount.set(accountId, posts);
    }

    const hit = posts.find((p) => p.text && textSimilarity(p.text, text) >= MATCH_THRESHOLD);
    if (!hit) continue; // 沒吻合 → 留待人工，不動

    const patch: Partial<Draft> = {
      published_post_id: hit.id,
      published_at: new Date().toISOString()
    };
    // 主文已確認發出；若該篇有留言（2/2 分潤連結）且尚未補，交給既有延遲留言流程補（不在此直接發，避免重複）。
    if (d.reply_text && d.reply_status !== "published") patch.reply_status = "pending";

    const updated = await updateDraftStatusAtomic(d.id, "published", "needs_verification", patch, ownerId);
    if (updated) resolved++;
  }

  return { resolved, checked };
}
