import type { Draft, ThreadSegment, DraftMedia } from "@/lib/types";
import { normalizeReplyMedia } from "@/lib/media";
import { textSimilarity } from "@/lib/text-similarity";

// 主文之後要依序補發的「有效段落鏈」（純函式、可單測）：
// 優先用 thread_chain；為空時退回單則 reply_text/reply_media（向後相容）。
// 過濾掉無內容（無文字且無媒體）的段落，避免發出空白串文。
export function effectiveChain(
  d: Pick<Draft, "thread_chain" | "reply_text" | "reply_media">
): ThreadSegment[] {
  const raw = Array.isArray(d.thread_chain) ? d.thread_chain : [];
  const chain = raw
    .map((seg) => ({ text: seg?.text ?? null, media: filterMedia(seg?.media) }))
    .filter((seg) => Boolean(seg.text && seg.text.trim()) || seg.media.length > 0);
  if (chain.length > 0) return chain;
  // 向後相容：舊草稿只有單則留言
  const replyMedia = normalizeReplyMedia(d);
  const replyText = d.reply_text ?? null;
  if ((replyText && replyText.trim()) || replyMedia.length > 0) {
    return [{ text: replyText, media: replyMedia }];
  }
  return [];
}

// 是否為「真正的多段串文鏈」（有效段落＞1）。只有多段才一律交給 worker 依序補（避免一次爆發＋需游標進度）；
// 單段（或無）等同單則留言，仍走「delay 0 即時補」的捷徑，故此處需 >1 才算（不可只判「有任一段」）。
export function hasThreadChain(d: Pick<Draft, "thread_chain">): boolean {
  const raw = Array.isArray(d.thread_chain) ? d.thread_chain : [];
  let count = 0;
  for (const seg of raw) {
    if (Boolean(seg?.text && seg.text.trim()) || filterMedia(seg?.media).length > 0) {
      if (++count > 1) return true;
    }
  }
  return false;
}

// 媒體有效性與發布層（threads/publish 的 isValidMedia）對齊：url 須為非空字串、type 須為 image/video。
// 否則 url='' 之類無效項會讓段落被誤判「有內容」而保留，補發時卻被發布層濾成空段落而失敗（行為不一致）。
function filterMedia(media: unknown): DraftMedia[] {
  if (!Array.isArray(media)) return [];
  return media.filter(
    (m): m is DraftMedia =>
      Boolean(
        m &&
          typeof m === "object" &&
          typeof (m as DraftMedia).url === "string" &&
          (m as DraftMedia).url.trim().length > 0 &&
          ((m as DraftMedia).type === "image" || (m as DraftMedia).type === "video")
      )
  );
}

export interface ChainStep {
  segment: ThreadSegment; // 這次要補發的段落
  isLast: boolean; // 補完這段後整條鏈是否結束
  nextCursor: number; // 補完後的游標（cursor+1）
}

// 取得游標當前要補發的段落與後續進度；cursor 越界（已補完或無段落）回 null。
export function chainStepAt(chain: ThreadSegment[], cursor: number): ChainStep | null {
  if (cursor < 0 || cursor >= chain.length) return null;
  return { segment: chain[cursor], isLast: cursor + 1 >= chain.length, nextCursor: cursor + 1 };
}

export interface ReplyProgress {
  done: boolean; // 從 startCursor 起的段落都已（在近期貼文中）確認發出 → 整條完成
  moved: boolean; // 至少確認了一段（游標有前進）
  cursor: number; // 確認後的游標
  lastPostId: string; // 確認到的最後一段貼文 id（串接下一段用）
}

// 用「自帳號近期貼文」回推串文補發的真實進度（純函式、可單測）：
// 從 startCursor 起，逐段以文字相似度比對近期貼文（同一 post id 不重複比中），比中就前進游標、更新 lastPostId。
// 用途：補留言「實際發出了卻被標 failed」時，據此把狀態修正為已發/續發，避免假失敗與重貼。
// 媒體段（無文字）無法文字比對 → 停在該段（交回 worker/人工），不亂判。
export function resolveReplyProgress(
  chain: ThreadSegment[],
  startCursor: number,
  startLastPostId: string,
  recentPosts: { id: string; text: string }[],
  threshold = 0.7
): ReplyProgress {
  let cursor = Math.max(0, startCursor);
  let lastPostId = startLastPostId;
  let moved = false;
  const used = new Set<string>();
  while (cursor < chain.length) {
    const segText = chain[cursor]?.text ?? "";
    if (!segText.trim()) break; // 媒體段無法文字比對 → 停
    const hit = recentPosts.find((p) => p.id && !used.has(p.id) && p.text && textSimilarity(p.text, segText) >= threshold);
    if (!hit) break; // 這段確實沒在近期貼文中 → 停（真失敗）
    used.add(hit.id);
    lastPostId = hit.id;
    cursor += 1;
    moved = true;
  }
  return { done: cursor >= chain.length, moved, cursor, lastPostId };
}
