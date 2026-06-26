"use client";

import { useEffect, useRef, useState } from "react";

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

  function hit() {
    try {
      navigator.sendBeacon?.("/api/redirect/hit", new Blob([JSON.stringify({ code })], { type: "application/json" }));
    } catch {
      // 計數失敗不影響導流
    }
  }

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

  // 倒數歸零自動跳轉：只前往來源原文，不開分潤（非真實點擊）。
  useEffect(() => {
    if (left <= 0) {
      if (!fired.current) {
        fired.current = true;
        hit();
        window.location.href = sourceUrl;
      }
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  return (
    <div className="mt-5 space-y-2">
      <button type="button" onClick={onContinue} className="btn btn-brand w-full">
        <span aria-live="polite">繼續 →{left > 0 ? `（${left} 秒後自動前往）` : "前往中…"}</span>
      </button>
      <a href={sourceUrl} rel="noopener nofollow" className="block text-xs text-ink-3 hover:text-ink">
        直接看原文
      </a>
    </div>
  );
}
