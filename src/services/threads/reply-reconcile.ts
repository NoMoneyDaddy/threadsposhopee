// 補留言「假失敗」自動修正（讀回驗證）：留言其實已發到 Threads，卻因送出後逾時/網路中斷被標 failed
// （publishReply 的 publishContainer 步驟一旦送出即「可能已發」，但留言路徑未做 needs_verification）。
// 對 reply_status='failed' 的草稿，讀回該帳號近期貼文，用文字相似度確認各段是否其實已發：
// 全部已發 → 標 published；確認了前幾段但還有未發 → 推進游標續發（pending）；都沒中 → 留待人工（絕不重貼已發段落）。
import { listFailedReplies, advanceThreadSegment } from "@/lib/store";
import { getThreadsCredentials } from "@/lib/accounts-store";
import { listRecentThreadsPosts } from "@/services/threads/verify";
import { effectiveChain, resolveReplyProgress } from "@/services/publish/thread-chain";
import { log } from "@/lib/logger";

const MAX_PER_RUN = 30;

export async function reconcileFailedReplies(): Promise<{ resolved: number; advanced: number; checked: number }> {
  const drafts = await listFailedReplies(MAX_PER_RUN).catch((e) => {
    log.warn("reconcileFailedReplies：列出失敗留言失敗", { err: e });
    return [];
  });
  if (drafts.length === 0) return { resolved: 0, advanced: 0, checked: 0 };

  // 以帳號為單位快取近期貼文，避免同帳號重複抓。
  const recentByAccount = new Map<string, { id: string; text: string }[]>();
  let resolved = 0;
  let advanced = 0;
  let checked = 0;

  for (const d of drafts) {
    const ownerId = d.owner_id;
    const accountId = d.threads_account_id;
    if (!ownerId || !accountId || !d.published_post_id) continue;
    const chain = effectiveChain(d);
    if (chain.length === 0) continue; // 無留言段落（理論上不會是 failed）
    checked++;

    let posts = recentByAccount.get(accountId);
    if (!posts) {
      const creds = await getThreadsCredentials(accountId, ownerId).catch(() => null);
      if (!creds) continue;
      posts = await listRecentThreadsPosts(creds.threadsUserId, creds.accessToken).catch(() => []);
      recentByAccount.set(accountId, posts);
    }
    if (posts.length === 0) continue; // 讀不到近期貼文 → 不亂判，留待下輪/人工

    const startCursor = d.thread_cursor ?? 0;
    const startLast = d.thread_last_post_id || d.published_post_id;
    const prog = resolveReplyProgress(chain, startCursor, startLast, posts);

    if (prog.done) {
      // 全部段落都已發出 → 標 published（修正假失敗）。
      await advanceThreadSegment(d.id, ownerId, { lastPostId: prog.lastPostId, nextCursor: prog.cursor, done: true }).catch((e) =>
        log.warn("reconcileFailedReplies：標記 published 失敗", { id: d.id, err: e })
      );
      resolved++;
    } else if (prog.moved) {
      // 確認前幾段已發、仍有未發段落 → 推進游標、續發剩餘（pending，下輪 worker 接手），不重貼已發段落。
      await advanceThreadSegment(d.id, ownerId, { lastPostId: prog.lastPostId, nextCursor: prog.cursor, done: false, nextDueAt: new Date().toISOString() }).catch((e) =>
        log.warn("reconcileFailedReplies：推進續發失敗", { id: d.id, err: e })
      );
      advanced++;
    }
    // prog 都沒中 → 確實沒發出，維持 failed 交人工（避免誤判）。
  }
  return { resolved, advanced, checked };
}
