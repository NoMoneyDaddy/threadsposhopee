"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 正規轉址：「前往」一次點擊只導向來源原文（不再開任何分潤頁，純中轉＋廣告維運）。
// 倒數自動跳轉到來源；使用者可按「取消自動跳轉」停止倒數，改成純手動前往。
// 來源被標為不安全（unsafe）時不倒數、不自動跳，須使用者主動確認風險才前往。
// 社群 App 內建瀏覽器情境：附明確「直接前往」連結作降級，使用者永遠到得了來源。
const AUTO_SECONDS = 5;

export default function ContinueButton({
  code,
  sourceUrl,
  unsafe = false
}: {
  code: string;
  sourceUrl: string;
  unsafe?: boolean;
}) {
  // unsafe：起始即視為「已取消倒數」，不自動前往，等使用者主動確認。
  const [left, setLeft] = useState(unsafe ? 0 : AUTO_SECONDS);
  const [cancelled, setCancelled] = useState(unsafe);
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
    hit();
    window.location.href = sourceUrl;
  }

  // 倒數歸零自動前往來源（已取消或 unsafe 則不啟動）。自動跳轉不計 continues（非主動點擊）。
  useEffect(() => {
    if (cancelled || fired.current) return;
    if (left <= 0) {
      fired.current = true;
      window.location.href = sourceUrl;
      return;
    }
    const t = setTimeout(() => {
      if (!fired.current && !cancelled) setLeft((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [left, cancelled, sourceUrl]);

  const counting = !cancelled && !unsafe && left > 0;
  return (
    <div className="mt-5 space-y-2">
      <button type="button" onClick={go} className="btn btn-brand w-full">
        <span aria-hidden="true">
          {unsafe ? "我了解風險，仍要前往 →" : counting ? `前往 →（${left} 秒後自動前往）` : "前往 →"}
        </span>
        <span className="sr-only" aria-live="polite">{counting ? "前往觀看內容" : "前往中…"}</span>
      </button>
      {counting && (
        <button
          type="button"
          onClick={() => setCancelled(true)}
          className="block w-full text-xs text-ink-3 hover:text-ink"
        >
          取消自動跳轉
        </button>
      )}
      <a href={sourceUrl} rel="noopener nofollow" className="block text-xs text-ink-3 hover:text-ink">
        直接前往
      </a>
    </div>
  );
}
