"use client";

import type { DraftMedia } from "@/lib/types";

// Threads 貼文即時預覽（仿 Typefully／Buffer 的所見即所得）。
// 顯示正文、媒體（單張或多張輪播）、以及留言區（分潤連結），讓使用者發布前先看版面。
export default function ThreadsPreview({
  accountLabel,
  mainText,
  replyText,
  mediaUrl,
  mediaType,
  media
}: {
  accountLabel?: string;
  mainText: string;
  replyText?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  media?: DraftMedia[];
}) {
  const handle = (accountLabel || "your_account").replace(/^@/, "");
  // 優先用 media 陣列；為空時退回單一 mediaUrl/mediaType（向後相容）
  const items: DraftMedia[] =
    media && media.length > 0
      ? media
      : mediaUrl && (mediaType === "image" || mediaType === "video")
        ? [{ url: mediaUrl, type: mediaType }]
        : [];
  const carousel = items.length > 1;
  // 留言＝串文接續貼文（Threads 上會顯示成 1/2、2/2 的串文鏈，非一般留言）
  const hasReply = Boolean(replyText && replyText.trim());
  const total = hasReply ? 2 : 1;
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 text-xs font-medium text-neutral-400">預覽（Threads 串文）</div>

      {/* 主文 1/2 */}
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
          {hasReply && <div className="mt-1 w-px flex-1 bg-neutral-200" />}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-neutral-900">{handle}</span>
            {total > 1 && <span className="text-neutral-400">{`1/${total}`}</span>}
            <span className="text-neutral-400">· 現在</span>
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-800">
            {mainText || <span className="text-neutral-300">正文預覽…</span>}
          </div>
          {items.length > 0 && (
            <div className={carousel ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "mt-2"}>
              {items.map((m, i) => {
                const cls = carousel
                  ? "h-44 w-44 shrink-0 rounded-lg border object-cover"
                  : "max-h-72 w-full rounded-lg border object-cover";
                return m.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={`${m.url}-${i}`} src={m.url} alt="" className={cls} />
                ) : (
                  <video key={`${m.url}-${i}`} src={m.url} controls className={cls} />
                );
              })}
            </div>
          )}
          {carousel && <div className="mt-1 text-xs text-neutral-400">輪播 {items.length} 則媒體</div>}
          <div className="mt-2 flex gap-5 text-neutral-400">
            <span className="text-xs">♡ 讚</span>
            <span className="text-xs">💬 留言</span>
            <span className="text-xs">↻ 轉發</span>
          </div>
        </div>
      </div>

      {/* 接續貼文 2/2（分潤連結 CTA） */}
      {hasReply && (
        <div className="flex gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex items-center gap-1 text-sm">
              <span className="font-semibold text-neutral-900">{handle}</span>
              <span className="text-neutral-400">{`2/${total}`}</span>
              <span className="text-neutral-400">· 接續</span>
            </div>
            <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-shopee">{replyText}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Threads 單篇上限 500 字。回傳計數顏色與是否超過。
export function CharCount({ text, limit = 500 }: { text: string; limit?: number }) {
  const len = [...text].length; // 以字元（含 emoji）計
  const over = len > limit;
  const near = len > limit * 0.9;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-red-500" : near ? "text-amber-500" : "text-neutral-400"}`}>
      {len} / {limit}
    </span>
  );
}
