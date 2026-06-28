"use client";

import { TOUR_OPEN_EVENT } from "./product-tour-logic";

// 「開始互動導覽」按鈕：派發自訂事件喚起全站掛載的 ProductTour 對話框。
// 圖示一律 SVG（不用表情符號）。可放任何頁面（如使用說明頁、全站頁尾），隨時重開導覽。
export default function TourLaunchButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))}
      className={className ?? "inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"}
    >
      {children ?? (
        <>
          {/* 羅盤圖示（導覽意象），SVG 取代原本的 emoji */}
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" />
          </svg>
          開始互動導覽
        </>
      )}
    </button>
  );
}
