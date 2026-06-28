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

  // 「我不看了，關閉頁面」：停止倒數並關閉分頁；無法關閉（非 script 開啟的分頁）時退回上一頁。
  function leave() {
    setCancelled(true);
    fired.current = true; // 阻止倒數 effect 再自動前往
    try {
      window.close();
    } catch {
      /* 忽略 */
    }
    // window.close 對一般分頁多半無效：退回上一頁作為降級（仍離開本中轉頁）。
    setTimeout(() => {
      try {
        if (history.length > 1) history.back();
      } catch {
        /* 忽略 */
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
      <button type="button" onClick={go} className="btn btn-brand w-full">
        <span aria-hidden="true">
          {unsafe ? "我了解風險，仍要前往 →" : counting ? `前往 →（${left} 秒）` : "前往 →"}
        </span>
        <span className="sr-only" aria-live="polite">{srStatus}</span>
      </button>
      <button
        type="button"
        onClick={leave}
        className="block w-full text-xs text-ink-3 hover:text-ink"
      >
        我不看了，關閉頁面
      </button>
    </div>
  );
}
