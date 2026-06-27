"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// 管理頁「發文控制＋排程狀態」面板（owner 限定）：
// - 全域發文暫停/恢復（緊急急停所有自動發文；不影響草稿頁手動單篇發）。
// - 顯示上次排程（cron）心跳，判斷自動駕駛是否運轉。
// cron 狀態文字在 server 端（admin 頁）算好傳入，避免 client 端 Date.now() 造成 hydration 不一致。
export default function PublishControlPanel({
  initialPaused,
  pausedUnknown = false,
  cron
}: {
  initialPaused: boolean;
  // 讀取暫停狀態失敗時為 true：不偽裝成「運行中」，明確標示未知並提示操作可強制設定。
  pausedUnknown?: boolean;
  cron: { tone: string; text: string };
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // router.refresh() 後 server 會帶入新的 initialPaused，但 useState 不會自動重置；
  // 同步本地 state 以免顯示與按鈕文案停留在舊值（CodeRabbit 指出）。
  useEffect(() => {
    setPaused(initialPaused);
  }, [initialPaused]);

  async function toggle() {
    const next = !paused;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/publish/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setPaused(json.paused);
      setMsg(json.paused ? "⏸️ 已暫停所有自動發文" : "▶️ 已恢復自動發文");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">發文控制 ＆ 排程狀態</h2>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">
            全域自動發文：
            {pausedUnknown ? (
              <span className="text-amber-600">狀態未知（讀取失敗）</span>
            ) : paused ? (
              <span className="text-red-600">已暫停</span>
            ) : (
              <span className="text-green-600">運行中</span>
            )}
          </div>
          <div className="text-xs text-ink-3">
            {pausedUnknown
              ? "無法確認目前狀態，可按右側按鈕強制設定。暫停會讓 cron 與「立即跑一輪」整批跳過；草稿頁手動單篇發布不受影響。"
              : "暫停會讓 cron 與「立即跑一輪」整批跳過；草稿頁手動單篇發布不受影響。"}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
            paused ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"
          } disabled:opacity-50`}
        >
          {busy ? "處理中…" : paused ? "▶ 恢復發文" : "⏸ 緊急暫停"}
        </button>
      </div>

      <div className={`text-sm ${cron.tone}`}>{cron.text}</div>
      {msg && <div className="text-sm text-ink-2">{msg}</div>}
    </div>
  );
}
