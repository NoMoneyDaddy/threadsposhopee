"use client";

import { useEffect, useState } from "react";

// 頁首小時鐘：顯示目前台北時間（Asia/Taipei），每秒更新。
// 排程／倒數都以台北時間計算，這顆時鐘讓使用者對得上「現在幾點、下一篇還多久」。
// 只在 client 端掛載後才顯示（先回 null），避免 SSR/hydration 時間不一致。
export default function LiveClock() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("zh-TW", {
          timeZone: "Asia/Taipei",
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="whitespace-nowrap tabular-nums text-ink-3" title="目前台北時間（Asia/Taipei）" aria-label={`目前台北時間 ${now}`}>
      🕐 {now}
    </span>
  );
}
