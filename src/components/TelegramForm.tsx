"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 個人 Telegram 通知：綁自己的 chat_id，接收屬於自己的提醒（如「你的貼文可能已發出待確認」）。
export default function TelegramForm({ bound, botConfigured }: { bound: boolean; botConfigured: boolean }) {
  const router = useRouter();
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(payload: Record<string, unknown>, label: string) {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(label === "unbind" ? "✅ 已解除" : "✅ 已連結，測試訊息已送出");
      setChatId("");
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
        <span className="font-medium">個人 Telegram 通知</span>
        {bound ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已連結</span>
        ) : (
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">未連結</span>
        )}
      </div>
      <p className="mb-2 text-xs text-neutral-500">
        綁定後，屬於你的重要提醒（如貼文「可能已發出待確認」）會即時推到你的 Telegram。
        取得 chat_id：在 Telegram 對本系統 bot 按 <code>/start</code>，再傳訊息給{" "}
        <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-shopee hover:underline">
          @userinfobot
        </a>{" "}
        取得你的 <code>Id</code>。
      </p>

      {!botConfigured && (
        <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-700">
          ⚠️ 系統尚未設定 Telegram bot（<code>TELEGRAM_BOT_TOKEN</code>），個人通知暫時無法使用。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          inputMode="numeric"
          placeholder={bound ? "輸入新的 chat_id 以更新" : "你的 Telegram chat_id（數字）"}
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          disabled={!botConfigured}
        />
        <button
          onClick={() => call({ chatId: chatId.trim() }, "bind")}
          disabled={!!busy || !botConfigured || !chatId.trim()}
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
