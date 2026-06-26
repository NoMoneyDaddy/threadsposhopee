"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// 「繼續」一次點擊：①（有分潤時）另開分潤/優惠頁 ②本頁前往來源。
// 分潤僅在「使用者真實點擊」時開啟＝合法計佣；絕不做零點擊自動觸發（cookie stuffing）。
// 倒數自動跳轉只導向來源原文（不開分潤），維持「真實點擊才計佣」底線。
// 社群 App 內建瀏覽器常擋新分頁：附明確「直接看原文」連結作降級，使用者永遠到得了來源。
const AUTO_SECONDS = 5;

export default function ContinueButton({
  code,
  sourceUrl,
  affiliateUrl
}: {
  code: string;
  sourceUrl: string;
  affiliateUrl: string | null;
}) {
  const [left, setLeft] = useState(AUTO_SECONDS);
  const fired = useRef(false);

  const hit = useCallback(() => {
    try {
      navigator.sendBeacon?.("/api/redirect/hit", new Blob([JSON.stringify({ code })], { type: "application/json" }));
    } catch {
      // 計數失敗不影響導流
    }
  }, [code]);

  // 使用者真實點擊：開分潤（新分頁）＋本頁前往來源。
  function onContinue() {
    if (fired.current) return;
    fired.current = true;
    hit();
    if (affiliateUrl) {
      // 新分頁開分潤（user gesture 內，桌機/原生瀏覽器可行；webview 可能被擋→使用者仍會被導到來源）
      window.open(affiliateUrl, "_blank", "noopener");
    }
    window.location.href = sourceUrl;
  }

  // 倒數歸零自動跳轉：只前往來源原文，不開分潤、也不計「繼續」（非真實點擊；hit 僅留給手動點擊）。
  useEffect(() => {
    if (fired.current) return; // 已（手動或自動）觸發跳轉→不再排計時器/更新狀態
    if (left <= 0) {
      fired.current = true;
      window.location.href = sourceUrl;
      return;
    }
    const t = setTimeout(() => {
      if (!fired.current) setLeft((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [left, sourceUrl]);

  return (
    <div className="mt-5 space-y-2">
      <button type="button" onClick={onContinue} className="btn btn-brand w-full">
        {/* 視覺：每秒更新的倒數（對報讀器隱藏，避免每秒朗讀噪音） */}
        <span aria-hidden="true">繼續 →{left > 0 ? `（${left} 秒後自動前往）` : "前往中…"}</span>
        {/* 報讀器：只在「掛載」與「歸零跳轉」兩個狀態變化時朗讀，不逐秒播報 */}
        <span className="sr-only" aria-live="polite">{left > 0 ? "繼續，前往觀看文章" : "前往中…"}</span>
      </button>
      <a href={sourceUrl} rel="noopener nofollow" className="block text-xs text-ink-3 hover:text-ink">
        直接看原文
      </a>
    </div>
  );
}
