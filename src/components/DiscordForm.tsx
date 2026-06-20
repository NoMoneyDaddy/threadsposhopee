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
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">個人 Discord 通知</span>
        {bound ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已連結</span>
        ) : (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">未連結</span>
        )}
      </div>
      <p className="mb-2 text-xs text-neutral-500">
        在 Discord 頻道「編輯頻道 → 整合 → 建立 Webhook」複製 Webhook URL 貼上。可與 Telegram 同時啟用。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          type="url"
          placeholder={bound ? "貼上新的 webhook 以更新" : "https://discord.com/api/webhooks/..."}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          onClick={() => call({ url: url.trim() }, "bind")}
          disabled={!!busy || !url.trim()}
          className="rounded-md bg-shopee px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy === "bind" ? "連結中…" : bound ? "更新" : "連結並測試"}
        </button>
        {bound && (
          <button
            onClick={() => call({ unbind: true }, "unbind")}
            disabled={!!busy}
            className="rounded-md border px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy === "unbind" ? "解除中…" : "解除"}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-neutral-600">{msg}</p>}
    </div>
  );
}
