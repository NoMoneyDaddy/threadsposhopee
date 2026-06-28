"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 正規轉址：「前往」一次點擊導向來源原文（純中轉＋廣告維運）。倒數自動前往；
// 使用者可按「我不看了，關閉頁面」直接離開（停止倒數並關閉分頁）。
// 來源被標為不安全（unsafe）時不倒數、不自動跳，須使用者主動確認風險才前往。
export default function ContinueButton({
  code,
  sourceUrl,
  unsafe = false,
  seconds = 5
}: {
  code: string;
  sourceUrl: string;
  unsafe?: boolean;
  seconds?: number; // 倒數秒數（由頁面依是否有廣告決定；unsafe 時不倒數）
}) {
  // unsafe：起始即視為「已取消倒數」，不自動前往，等使用者主動確認。
  const [left, setLeft] = useState(unsafe ? 0 : seconds);
  const [cancelled, setCancelled] = useState(unsafe);
  const [navigating, setNavigating] = useState(false); // 真正開始導向才為 true（給報讀器精準狀態）
  const fired = useRef(false);

  const hit = useCallback(() => {
    try {
      navigator.sendBeacon?.("/api/redirect/hit", new Blob([JSON.stringify({ code })], { type: "application/json" }));
    } catch {
      // 計數失敗不影響導流
    }
  }, [code]);

  // 使用者主動點「前往」：計一次點擊（continues）＋本頁前往來源。
  function go() {
    if (fired.current) return;
    fired.current = true;
    setNavigating(true);
    hit();
    window.location.href = sourceUrl;
  }

  // 「我不看了，關閉頁面」：停止倒數並離開本頁。只設 cancelled 停倒數＋自動前往
  // （倒數 effect 以 cancelled 早退）；不可動 fired，否則 window.close 被擋時「前往」也會被永久封死。
  function leave() {
    setCancelled(true);
    try {
      window.close();
    } catch {
      /* 忽略 */
    }
    // window.close 對 script 未開啟的一般分頁多半無效：有上一頁就退回，否則導向服務首頁，
    // 確保使用者一定離得開本中轉頁、不會被卡住。
    setTimeout(() => {
      try {
        if (window.history.length > 1) window.history.back();
        else window.location.replace("/r");
      } catch {
        window.location.replace("/r");
      }
    }, 100);
  }

  // 倒數歸零自動前往來源（已取消或 unsafe 則不啟動）。自動跳轉不計 continues（非主動點擊）。
  useEffect(() => {
    if (cancelled || fired.current) return;
    if (left <= 0) {
      fired.current = true;
      setNavigating(true);
      window.location.href = sourceUrl;
      return;
    }
    const t = setTimeout(() => {
      if (!fired.current && !cancelled) setLeft((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [left, cancelled, sourceUrl]);

  const counting = !cancelled && !unsafe && left > 0;
  const srStatus = navigating ? "前往中…" : counting ? "前往觀看內容" : unsafe ? "確認後前往" : "可前往";
  return (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={go}
        className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-full bg-[#0e7490] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#155e6b] focus-visible:ring-[#0e7490]/60 active:translate-y-px"
      >
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          {unsafe ? "我了解風險，仍要前往" : counting ? `前往（${left} 秒）` : "前往"}
          {/* 箭頭一律用 SVG（不用文字箭號或表情符號） */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
        </span>
        <span className="sr-only" aria-live="polite">{srStatus}</span>
      </button>
      <button
        type="button"
        onClick={leave}
        className="block w-full text-xs text-[#7ba0aa] transition-colors hover:text-[#0c3543]"
      >
        我不看了，關閉頁面
      </button>
    </div>
  );
}
