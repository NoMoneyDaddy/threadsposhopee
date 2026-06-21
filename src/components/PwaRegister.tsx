"use client";

import { useEffect, useState } from "react";

// PWA 註冊＋安裝提示。註冊 /sw.js（僅為可安裝性），並在支援的瀏覽器顯示一次性
// 「加到主畫面」提示；使用者關閉後以 localStorage 記住不再顯示。
const DISMISS_KEY = "iwantpo:pwa-tip-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 註冊失敗不影響使用（例如不支援或非 HTTPS）；靜默忽略。
    });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="安裝 IwantPo"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-lg sm:inset-x-auto sm:right-4"
    >
      <p className="text-sm font-medium text-ink">把 IwantPo 加到主畫面</p>
      <p className="mt-1 text-xs text-ink-3">像 App 一樣全螢幕開啟、一鍵啟動，不佔瀏覽器分頁。</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={dismiss} className="rounded-lg px-3 py-1.5 text-xs text-ink-3 hover:text-ink">
          以後再說
        </button>
        <button
          onClick={install}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          加到主畫面
        </button>
      </div>
    </div>
  );
}
