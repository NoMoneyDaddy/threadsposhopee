import type { Draft, ThreadSegment, DraftMedia } from "@/lib/types";
import { normalizeReplyMedia } from "@/lib/media";

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
