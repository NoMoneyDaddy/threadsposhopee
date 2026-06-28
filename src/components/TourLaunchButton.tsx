"use client";

import { TOUR_OPEN_EVENT } from "./product-tour-logic";

// 「開始互動導覽」按鈕：派發自訂事件喚起全站掛載的 ProductTour 對話框。
export default function TourLaunchButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(TOUR_OPEN_EVENT))}
      className={className ?? "inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"}
    >
      {children ?? "🧭 開始互動導覽"}
    </button>
  );
}
