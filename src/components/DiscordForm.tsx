"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 個人 Discord 通知：綁自己的 Discord webhook，接收與 Telegram 相同的個人提醒（可同時綁兩者）。
export default function DiscordForm({ bound }: { bound: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(label === "unbind" ? "✅ 已解除" : "✅ 已連結，測試訊息已送出");
      setUrl("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">個人 Discord 通知</span>
        {bound ? <span className="badge-success">已連結</span> : <span className="badge-neutral">未連結</span>}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        在 Discord 頻道「編輯頻道 → 整合 → 建立 Webhook」複製 Webhook URL 貼上。可與 Telegram 同時啟用。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          type="url"
          placeholder={bound ? "貼上新的 webhook 以更新" : "https://discord.com/api/webhooks/..."}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={() => call({ url: url.trim() }, "bind")}
          disabled={!!busy || !url.trim()}
          className="btn btn-brand shrink-0"
        >
          {busy === "bind" ? "連結中…" : bound ? "更新" : "連結並測試"}
        </button>
        {bound && (
          <button
            onClick={() => call({ unbind: true }, "unbind")}
            disabled={!!busy}
            className="btn btn-outline shrink-0"
          >
            {busy === "unbind" ? "解除中…" : "解除"}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
    </div>
  );
}
