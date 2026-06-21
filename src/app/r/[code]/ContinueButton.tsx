"use client";

// 「繼續」一次點擊：①（有分潤時）另開分潤/優惠頁 ②本頁前往來源。
// 分潤僅在「使用者真實點擊」時開啟＝合法計佣；絕不做零點擊自動觸發（cookie stuffing）。
// 社群 App 內建瀏覽器常擋新分頁：附明確「直接看原文」連結作降級，使用者永遠到得了來源。
export default function ContinueButton({
  code,
  sourceUrl,
  affiliateUrl
}: {
  code: string;
  sourceUrl: string;
  affiliateUrl: string | null;
}) {
  function onContinue() {
    try {
      navigator.sendBeacon?.("/api/redirect/hit", new Blob([JSON.stringify({ code })], { type: "application/json" }));
    } catch {
      // 計數失敗不影響導流
    }
    if (affiliateUrl) {
      // 新分頁開分潤（user gesture 內，桌機/原生瀏覽器可行；webview 可能被擋→使用者仍會被導到來源）
      window.open(affiliateUrl, "_blank", "noopener");
    }
    window.location.href = sourceUrl;
  }

  return (
    <div className="mt-5 space-y-2">
      <button type="button" onClick={onContinue} className="btn btn-brand w-full">
        繼續 →
      </button>
      <a href={sourceUrl} rel="noopener nofollow" className="block text-xs text-ink-3 hover:text-ink">
        直接看原文
      </a>
    </div>
  );
}
