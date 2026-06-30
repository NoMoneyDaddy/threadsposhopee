"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { DraftMedia } from "@/lib/types";
import MediaUpload from "@/components/MediaUpload";
import { cloudinaryThumb } from "@/lib/img";

const input = "w-full rounded-xl border px-3 py-2 text-sm";
export const MAX_MEDIA = 20; // Threads 單篇輪播上限（對齊後端 MAX_CAROUSEL_ITEMS）

// 多媒體挑選器（主文／留言／素材共用）：本機可一次多選上傳，或貼網址加入；
// 縮圖可逐張移除、用 ◀▶ 調整輪播順序。圖片影片可混排，上限 MAX_MEDIA。
export default function MediaPicker({
  items,
  onChange,
  cloud,
  preset,
  hint
}: {
  items: DraftMedia[];
  onChange: Dispatch<SetStateAction<DraftMedia[]>>;
  cloud: string | null;
  preset: string | null;
  hint: string;
}) {
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"image" | "video">("image");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const atLimit = items.length >= MAX_MEDIA;
  // functional update：上傳是非同步，回呼觸發時以最新狀態為基準，避免舊 closure 覆蓋掉期間的新增/移除。
  const add = (m: DraftMedia) => onChange((prev) => (prev.length >= MAX_MEDIA ? prev : [...prev, m]));
  const removeAt = (i: number) => onChange((prev) => prev.filter((_, idx) => idx !== i));
  // 把第 from 項移到 to 位置，調整輪播出現順序（桌機拖拉與 ◀▶ 鈕共用）。
  const moveTo = (from: number, to: number) =>
    onChange((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((m, i) => (
            <div
              key={`${m.url}-${i}`}
              draggable={items.length > 1}
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveTo(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={
                "relative rounded-lg" +
                (items.length > 1 ? " cursor-move" : "") +
                (dragIndex === i ? " opacity-40 ring-2 ring-brand" : "")
              }
            >
              {m.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cloudinaryThumb(m.url, 160)} alt="" className="h-16 w-16 rounded-lg border object-cover" />
              ) : (
                <video src={m.url} aria-label={`第 ${i + 1} 個媒體（影片）預覽`} muted playsInline className="h-16 w-16 rounded-lg border object-cover" />
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label={`移除第 ${i + 1} 個媒體`}
                className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs text-white hover:bg-black"
              >
                ✕
              </button>
              {/* 手機等不支援拖拉時的後備：◀▶ 鈕調整輪播順序 */}
              {items.length > 1 && (
                <div className="absolute inset-x-0 bottom-0 flex justify-between rounded-b-lg bg-black/55 text-white">
                  <button
                    type="button"
                    onClick={() => moveTo(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`第 ${i + 1} 個媒體往前移`}
                    className="px-1.5 text-xs leading-5 disabled:opacity-30"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTo(i, i + 1)}
                    disabled={i === items.length - 1}
                    aria-label={`第 ${i + 1} 個媒體往後移`}
                    className="px-1.5 text-xs leading-5 disabled:opacity-30"
                  >
                    ▶
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <MediaUpload
          cloud={cloud}
          preset={preset}
          multiple
          disabled={atLimit}
          remaining={MAX_MEDIA - items.length}
          onUploaded={(u, t) => add({ url: u, type: t })}
        />
        <span className="text-xs text-ink-3">{atLimit ? `已達上限 ${MAX_MEDIA} 個媒體` : hint}</span>
        <details className="ml-auto text-xs text-ink-3">
          <summary className="cursor-pointer select-none hover:text-ink">或貼網址</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className={input + " flex-1"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                // 攔 Enter：執行「加入」而非冒泡觸發外層 form submit（素材表單是 <form>）。
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!atLimit && url.trim()) {
                    add({ url: url.trim(), type });
                    setUrl("");
                  }
                }
              }}
              placeholder="圖片／影片網址"
              inputMode="url"
              aria-label="媒體網址"
            />
            <select
              className="rounded-xl border px-2 py-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "image" | "video")}
              aria-label="媒體類型"
            >
              <option value="image">圖片</option>
              <option value="video">影片</option>
            </select>
            <button
              type="button"
              disabled={atLimit}
              onClick={() => {
                if (url.trim()) {
                  add({ url: url.trim(), type });
                  setUrl("");
                }
              }}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
            >
              加入
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
