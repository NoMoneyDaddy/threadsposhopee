import type { DraftMedia, ThreadSegment } from "@/lib/types";

// 主文之後的串文段落鏈（純函式、可單測）：留言（2/n 分潤連結）＋更多段落（3/n…）。
// 過濾掉無內容（無文字且無媒體）的空段落。供 ThreadsPreview 渲染與測試共用。
export function buildAfterSegments(input: {
  replyText?: string | null;
  replyMedia?: DraftMedia[];
  extraSegments?: ThreadSegment[];
}): ThreadSegment[] {
  const replyItems = input.replyMedia ?? [];
  const reply: ThreadSegment[] =
    (input.replyText && input.replyText.trim()) || replyItems.length > 0
      ? [{ text: input.replyText ?? null, media: replyItems }]
      : [];
  const extras = (input.extraSegments ?? [])
    .map((s) => ({ text: s.text ?? null, media: s.media ?? [] }))
    .filter((s) => Boolean(s.text && s.text.trim()) || s.media.length > 0);
  return [...reply, ...extras];
}
