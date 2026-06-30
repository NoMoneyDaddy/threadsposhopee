"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 個人 Telegram 通知：綁自己的 chat_id，接收屬於自己的提醒（如「你的貼文可能已發出待確認」）。
// 綁定方式：一鍵 deeplink（開 bot → 按 START 自動綁定）為主，手動貼 chat_id 為後備。
export default function TelegramForm({ bound, botConfigured }: { bound: boolean; botConfigured: boolean }) {
  const router = useRouter();
  const [chatId, setChatId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // 卸載時停止輪詢並標記，避免非同步回呼對已卸載元件 setState。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // 呼叫 Telegram 綁定 API（手動貼 chat_id 綁定／更新／解除），成功後刷新頁面。
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

  // 一鍵綁定：取 deeplink → 開 bot → 輪詢綁定狀態，使用者按 START 後自動完成。
  async function startDeeplink() {
    setBusy("deeplink");
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/telegram/deeplink", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      if (!mountedRef.current) return;
      const win = window.open(json.url, "_blank", "noopener,noreferrer");
      if (!win) {
        // 被瀏覽器擋下（彈窗封鎖）：給可點連結作後備，不假裝已開啟。
        setMsg(`⚠️ 瀏覽器擋下了新分頁。請手動開啟：${json.url}`);
        setBusy(null);
        return;
      }
      setMsg("已開啟 Telegram，請在對話中按 START 完成綁定…");
      pollBind(40); // 每 3 秒查一次，最多約 2 分鐘
    } catch (e) {
      if (!mountedRef.current) return;
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
      setBusy(null);
    }
  }

  // 輪詢綁定狀態：每 3 秒查一次，最多 left 次；偵測到 bound 即刷新；卸載後停止。
  function pollBind(left: number) {
    if (!mountedRef.current) return;
    if (pollRef.current) clearTimeout(pollRef.current);
    if (left <= 0) {
      setMsg("尚未偵測到綁定。按 START 後若仍未更新，可重新整理本頁或改用手動輸入。");
      setBusy(null);
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/accounts/telegram");
        const json = await res.json();
        if (!mountedRef.current) return;
        if (json.ok && json.bound) {
          setMsg("✅ 已完成綁定");
          setBusy(null);
          router.refresh();
          return;
        }
      } catch {
        // 忽略單次失敗，繼續輪詢
      }
      if (mountedRef.current) pollBind(left - 1);
    }, 3000);
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">個人 Telegram 通知</span>
        {bound ? <span className="badge-success">已連結</span> : <span className="badge-neutral">未連結</span>}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        綁定後，屬於你的重要提醒會即時推到 Telegram；<b>待審草稿還會附「核准／駁回」按鈕，可直接遠端審核</b>（僅限與 bot 的私聊，不支援群組）。
        最簡單的方式是按下方「一鍵綁定」，開啟 bot 後按 <code>START</code> 即自動完成。
      </p>

      {!botConfigured && (
        <p className="mb-2 rounded-lg bg-warn/10 p-2 text-xs text-warn">
          ⚠️ 系統尚未設定 Telegram bot（<code>TELEGRAM_BOT_TOKEN</code>），個人通知暫時無法使用。
        </p>
      )}

      {botConfigured && (
        <button
          onClick={startDeeplink}
          disabled={!!busy}
          className="mb-3 inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs text-brand hover:bg-brand/20 disabled:opacity-50"
        >
          {busy === "deeplink" ? "等待綁定中…" : bound ? "✈ 重新綁定 Telegram" : "✈ 一鍵綁定 Telegram（按 START）"}
        </button>
      )}

      <details className="mb-2">
        <summary className="cursor-pointer text-xs text-ink-2">或手動輸入 chat_id</summary>
        <div className="mt-2 flex flex-wrap gap-2">
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
            {busy === "bind" ? "綁定中…" : bound ? "更新" : "綁定並測試"}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-ink-2">取得 chat_id：在 Telegram 對本 bot 按 <code>/start</code>，bot 會回覆你的 Chat ID。</p>
      </details>

      {bound && (
        <button
          onClick={() => call({ unbind: true }, "unbind")}
          disabled={!!busy}
          className="btn btn-outline shrink-0"
        >
          {busy === "unbind" ? "解除中…" : "解除綁定"}
        </button>
      )}

      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
    </div>
  );
}
