import type { DraftMedia, ThreadSegment } from "@/lib/types";

// 主文之後的串文段落鏈（純函式、可單測）：留言（2/n 分潤連結）＋更多段落（3/n…）。
// 過濾掉無內容（無文字且無媒體）的空段落。供 ThreadsPreview 渲染與測試共用。
export function buildAfterSegments(input: {
  replyText?: string | null;
  replyMedia?: DraftMedia[];
  extraSegments?: ThreadSegment[];
}): ThreadSegment[] {
  // 與發布層 effectiveChain/filterMedia 一致：url 須 trim 後非空，否則預覽段數會與實際補發不符。
  const normalizeMedia = (media?: DraftMedia[]): DraftMedia[] =>
    (media ?? []).filter((m) => typeof m.url === "string" && Boolean(m.url.trim())).map((m) => ({ ...m, url: m.url.trim() }));
  const replyItems = normalizeMedia(input.replyMedia);
  const reply: ThreadSegment[] =
    (input.replyText && input.replyText.trim()) || replyItems.length > 0
      ? [{ text: input.replyText ?? null, media: replyItems }]
      : [];
  const extras = (input.extraSegments ?? [])
    .map((s) => ({ text: s.text ?? null, media: normalizeMedia(s.media) }))
    .filter((s) => Boolean(s.text && s.text.trim()) || s.media.length > 0);
  return [...reply, ...extras];
}
