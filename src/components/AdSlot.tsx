"use client";

import { useEffect } from "react";

// Google AdSense 廣告單元（選用）：需設 NEXT_PUBLIC_ADSENSE_CLIENT ＋ 傳入 slot（AdSense 後台建立的廣告單元 id）。
// 未設定則不顯示任何東西（不留空位）。建議只放在公開頁（政策＋體驗考量）。
const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

export default function AdSlot({ slot, className }: { slot?: string; className?: string }) {
  useEffect(() => {
    if (!CLIENT || !slot) return;
    try {
      // adsbygoogle 由 layout 的載入器掛上 window
      ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []).push({});
    } catch {
      // 載入器尚未就緒時忽略（下次渲染會再試）
    }
  }, [slot]);

  if (!CLIENT || !slot) return null;
  return (
    <ins
      className={`adsbygoogle block ${className ?? ""}`}
      style={{ display: "block" }}
      data-ad-client={CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
