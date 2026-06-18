"use client";

// Threads 貼文即時預覽（仿 Typefully／Buffer 的所見即所得）。
// 顯示正文、媒體、以及留言區（分潤連結），讓使用者發布前先看版面。
export default function ThreadsPreview({
  accountLabel,
  mainText,
  replyText,
  mediaUrl,
  mediaType
}: {
  accountLabel?: string;
  mainText: string;
  replyText?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  const handle = (accountLabel || "your_account").replace(/^@/, "");
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 text-xs font-medium text-neutral-400">預覽</div>
      <div className="flex gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold text-neutral-900">{handle}</span>
            <span className="text-neutral-400">· 現在</span>
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-800">
            {mainText || <span className="text-neutral-300">正文預覽…</span>}
          </div>
          {mediaUrl && mediaType === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="mt-2 max-h-72 w-full rounded-lg border object-cover" />
          )}
          {mediaUrl && mediaType === "video" && (
            <video src={mediaUrl} controls className="mt-2 max-h-72 w-full rounded-lg border object-cover" />
          )}
          <div className="mt-2 flex gap-5 text-neutral-400">
            <span className="text-xs">♡ 讚</span>
            <span className="text-xs">💬 留言</span>
            <span className="text-xs">↻ 轉發</span>
          </div>
          {replyText && (
            <div className="mt-3 border-l-2 border-neutral-200 pl-3">
              <div className="flex items-center gap-1 text-sm">
                <span className="font-semibold text-neutral-900">{handle}</span>
                <span className="text-neutral-400">· 留言</span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-shopee">{replyText}</div>
            </div>
          )}
        </div>
      </div>
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
