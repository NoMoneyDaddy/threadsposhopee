"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 正規轉址：「前往」一次點擊導向來源原文（純中轉＋廣告維運）。倒數自動前往；
// 使用者可按「我不看了，關閉頁面」直接離開（停止倒數並關閉分頁）。
// 來源被標為不安全（unsafe）時不倒數、不自動跳，須使用者主動確認風險才前往。
export default function ContinueButton({
  code,
  sourceUrl,
  unsafe = false,
  seconds = 5,
  adUrl = null
}: {
  code: string;
  sourceUrl: string;
  unsafe?: boolean;
  seconds?: number; // 倒數秒數（由頁面依是否有廣告決定；unsafe 時不倒數）
  adUrl?: string | null; // 連結擁有者自訂廣告頁：使用者「主動點繼續」時於新分頁開啟（可直接關），本頁續往來源
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

  // 使用者主動點「前往」：計一次點擊（continues）＋（有廣告頁則於新分頁開廣告）＋本頁前往來源。
  // 廣告只在「使用者主動點擊」時開（瀏覽器允許此手勢下的 window.open），倒數自動前往不開廣告（會被擋且非本人意願）。
  function go() {
    if (fired.current) return;
    fired.current = true;
    setNavigating(true);
    hit();
    if (adUrl) {
      try {
        // noopener/noreferrer：新分頁不可反向操控本頁、不外洩 referrer。
        window.open(adUrl, "_blank", "noopener,noreferrer");
      } catch {
        /* 廣告開啟失敗不影響導流 */
      }
    }
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
  // 有廣告頁時「不自動前往」：倒數歸零只把按鈕變為可點，等使用者主動點擊才開廣告＋前往
  //（瀏覽器只在使用者手勢下才允許 window.open 新分頁；自動開會被攔且非本人意願）。
  useEffect(() => {
    if (cancelled || fired.current) return;
    if (left <= 0) {
      if (adUrl) return; // 有廣告：不自動跳，等點擊
      fired.current = true;
      setNavigating(true);
      window.location.href = sourceUrl;
      return;
    }
    const t = setTimeout(() => {
      if (!fired.current && !cancelled) setLeft((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [left, cancelled, sourceUrl, adUrl]);

  const counting = !cancelled && !unsafe && left > 0;
  const srStatus = navigating ? "前往中…" : counting ? "前往觀看內容" : unsafe ? "確認後前往" : "可前往";
  return (
    <div className="mt-5 space-y-2">
      <button
        type="button"
        onClick={go}
        className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-1.5 rounded-full bg-[#0e7490] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#155e6b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e7490]/60 active:translate-y-px"
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
        className="block w-full text-xs text-[#5a7d88] transition-colors hover:text-[#0c3543]"
      >
        我不看了，關閉頁面
      </button>
    </div>
  );
}
