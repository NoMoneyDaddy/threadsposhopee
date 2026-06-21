"use client";

import { useEffect, useState } from "react";

// VAPID 公鑰（base64url）轉成 Push API 需要的位元組陣列（明確以 ArrayBuffer 後備，滿足 BufferSource 型別）。
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// 瀏覽器推播開關：請求通知權限 → 以 VAPID 公鑰訂閱 → 存到伺服器。
export default function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function subscribe() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("未授權通知權限");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSubscribed(true);
      setMsg("✅ 已開啟瀏覽器推播");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("已關閉瀏覽器推播");
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div className="rounded-2xl border bg-surface p-4">
        <div className="mb-1 font-medium">瀏覽器推播</div>
        <p className="text-xs text-ink-3">此瀏覽器不支援 Web Push（iOS 需先「加到主畫面」後再開啟）。</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">瀏覽器推播</div>
      <p className="mb-2 text-xs text-ink-2">
        在此裝置接收待審草稿、發布結果、贊助違規等即時通知（依「通知偏好」個別開關）。
      </p>
      <button
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={busy}
        className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          subscribed ? "border text-ink-2 hover:bg-surface-2" : "bg-brand text-white"
        }`}
      >
        {busy ? "處理中…" : subscribed ? "關閉此裝置推播" : "開啟此裝置推播"}
      </button>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
