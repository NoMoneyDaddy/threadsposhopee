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
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">個人 Telegram 通知</span>
        {bound ? <span className="badge-success">已連結</span> : <span className="badge-neutral">未連結</span>}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        綁定後，屬於你的重要提醒會即時推到 Telegram；<b>待審草稿還會附「核准／駁回」按鈕，可直接遠端審核</b>。
        取得 chat_id：在 Telegram 對本系統 bot 按 <code>/start</code> 或傳任意訊息，bot 會直接回覆你的 Chat ID，貼到下方即可。
      </p>

      {!botConfigured && (
        <p className="mb-2 rounded-lg bg-warn/10 p-2 text-xs text-warn">
          ⚠️ 系統尚未設定 Telegram bot（<code>TELEGRAM_BOT_TOKEN</code>），個人通知暫時無法使用。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          inputMode="numeric"
          placeholder={bound ? "輸入新的 chat_id 以更新" : "你的 Telegram chat_id（數字）"}
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          disabled={!botConfigured}
        />
        <button
          onClick={() => call({ chatId: chatId.trim() }, "bind")}
          disabled={!!busy || !botConfigured || !chatId.trim()}
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
