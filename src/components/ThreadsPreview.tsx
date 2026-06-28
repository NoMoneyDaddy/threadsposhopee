"use client";

import { useEffect, useState } from "react";
import type { DraftMedia, ThreadSegment } from "@/lib/types";
import { cloudinaryThumb } from "@/lib/img";

// Threads 貼文即時預覽（仿 Typefully／Buffer 的所見即所得）。
// 顯示正文、媒體（單張或多張輪播），以及主文之後的串文段落（2/n 分潤連結、3/n…更多段落）。
export default function ThreadsPreview({
  accountLabel,
  displayName,
  avatarUrl,
  mainText,
  replyText,
  mediaUrl,
  mediaType,
  media,
  replyMedia,
  extraSegments
}: {
  accountLabel?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  mainText: string;
  replyText?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  media?: DraftMedia[];
  replyMedia?: DraftMedia[];
  extraSegments?: ThreadSegment[];
}) {
  const handle = (accountLabel || "your_account").replace(/^@/, "");
  // 只把網址染成連結色，其餘文字維持一般色（修正整段被當成超連結的問題）。
  const renderWithLinks = (text: string) =>
    text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <span key={i} className="text-brand underline">
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  const name = displayName?.trim() || handle;
  // 頭像載入失敗（過期/失效 URL）時退回佔位圓；avatarUrl 變動時重置。
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  // 真實頭像（#171 起各帳號可帶 avatar_url）；無或載入失敗則退回灰色漸層佔位圓。
  // 用區域渲染函數（非內部元件）：避免每次 render 重建元件型別導致頭像 remount／閃爍。
  // referrerPolicy=no-referrer：與 AccountsPage 一致，載入第三方頭像不外送 Referer（隱私）。
  const renderAvatar = () =>
    avatarUrl && !avatarFailed ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setAvatarFailed(true)}
        className="h-9 w-9 shrink-0 rounded-full border object-cover"
      />
    ) : (
      <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
    );
  // 優先用 media 陣列；為空時退回單一 mediaUrl/mediaType（向後相容）
  const items: DraftMedia[] =
    media && media.length > 0
      ? media
      : mediaUrl && (mediaType === "image" || mediaType === "video")
        ? [{ url: mediaUrl, type: mediaType }]
        : [];
  const carousel = items.length > 1;
  const replyItems: DraftMedia[] = replyMedia ?? [];
  // 主文之後的串文段落鏈：留言（2/n 分潤連結）＋更多段落（3/n…）。過濾掉無內容的空段落。
  const afterSegments: ThreadSegment[] = [
    ...((replyText && replyText.trim()) || replyItems.length > 0 ? [{ text: replyText ?? null, media: replyItems }] : []),
    ...(extraSegments ?? [])
      .map((s) => ({ text: s.text ?? null, media: s.media ?? [] }))
      .filter((s) => Boolean(s.text && s.text.trim()) || s.media.length > 0)
  ];
  const hasReply = afterSegments.length > 0;
  const total = 1 + afterSegments.length;
  // 媒體縮圖渲染（主文與留言共用）
  const renderMedia = (list: DraftMedia[]) => {
    const multi = list.length > 1;
    return (
      <div className={multi ? "mt-2 flex gap-2 overflow-x-auto pb-1" : "mt-2"}>
        {list.map((m, i) => {
          const cls = multi
            ? "h-44 w-44 shrink-0 rounded-2xl border object-cover"
            : "max-h-72 w-full rounded-2xl border object-cover";
          return m.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${m.url}-${i}`} src={cloudinaryThumb(m.url, 600)} alt="" loading="lazy" className={cls} />
          ) : (
            <video key={`${m.url}-${i}`} src={m.url} controls className={cls} />
          );
        })}
      </div>
    );
  };
  return (
    <div className="rounded-xl border bg-surface p-4">
      <div className="mb-2 text-xs font-medium text-ink-3">預覽（Threads 串文）</div>

      {/* 主文 1/2 */}
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center">
          {renderAvatar()}
          {hasReply && <div className="mt-1 w-px flex-1 bg-neutral-200" />}
        </div>
        <div className="min-w-0 flex-1 pb-3">
          <div className="flex items-center gap-1 text-sm">
            <span className="truncate font-semibold text-ink">{name}</span>
            {name !== handle && <span className="truncate text-ink-3">@{handle}</span>}
            {total > 1 && <span className="text-ink-3">{`1/${total}`}</span>}
            <span className="shrink-0 text-ink-3">· 現在</span>
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">
            {mainText ? renderWithLinks(mainText) : <span className="text-ink-3">正文預覽…</span>}
          </div>
          {items.length > 0 && renderMedia(items)}
          {carousel && <div className="mt-1 text-xs text-ink-3">輪播 {items.length} 則媒體</div>}
          <div className="mt-2 flex gap-5 text-ink-3">
            <span className="text-xs">♡ 讚</span>
            <span className="text-xs">💬 留言</span>
            <span className="text-xs">↻ 轉發</span>
          </div>
        </div>
      </div>

      {/* 接續貼文（2/n 分潤連結 CTA、3/n… 更多段落） */}
      {afterSegments.map((seg, idx) => {
        const segItems = seg.media ?? [];
        return (
          <div key={idx} className="flex gap-3">
            {renderAvatar()}
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-1 text-sm">
                <span className="truncate font-semibold text-ink">{name}</span>
                {name !== handle && <span className="truncate text-ink-3">@{handle}</span>}
                <span className="shrink-0 text-ink-3">{`${idx + 2}/${total}`}</span>
                <span className="shrink-0 text-ink-3">· 接續</span>
              </div>
              <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink">{seg.text ? renderWithLinks(seg.text) : null}</div>
              {segItems.length > 0 && renderMedia(segItems)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Threads 單篇上限 500 字。回傳計數顏色與是否超過。
export function CharCount({ text, limit = 500 }: { text: string; limit?: number }) {
  const len = [...text].length; // 以字元（含 emoji）計
  const over = len > limit;
  const near = len > limit * 0.9;
  return (
    <span className={`text-xs tabular-nums ${over ? "text-red-500" : near ? "text-amber-500" : "text-ink-3"}`}>
      {len} / {limit}
    </span>
  );
}
