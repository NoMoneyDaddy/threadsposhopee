"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 管理頁「發文控制＋排程狀態」面板（owner 限定）：
// - 全域發文暫停/恢復（緊急急停所有自動發文；不影響草稿頁手動單篇發）。
// - 顯示上次排程（cron）心跳，判斷自動駕駛是否運轉。
export default function PublishControlPanel({
  initialPaused,
  lastCronAt
}: {
  initialPaused: boolean;
  lastCronAt: string | null;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  // 心跳狀態：30 分鐘內視為運轉中。
  let cron: { tone: string; text: string };
  if (!lastCronAt) {
    cron = { tone: "text-ink-3", text: "尚未偵測到排程執行（自動駕駛未開啟）" };
  } else {
    const mins = Math.round((Date.now() - new Date(lastCronAt).getTime()) / 60000);
    const ago = mins < 1 ? "剛剛" : mins < 60 ? `${mins} 分鐘前` : `${Math.round(mins / 60)} 小時前`;
    cron =
      mins > 30
        ? { tone: "text-amber-600", text: `⚠️ 排程似乎停了（上次執行 ${ago}）` }
        : { tone: "text-green-600", text: `🚀 自動駕駛運轉中 — 上次執行 ${ago}` };
  }

  return (
    <div className="card space-y-3 p-4">
      <h2 className="text-lg font-semibold">發文控制 ＆ 排程狀態</h2>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 p-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink">
            全域自動發文：{paused ? <span className="text-red-600">已暫停</span> : <span className="text-green-600">運行中</span>}
          </div>
          <div className="text-xs text-ink-3">暫停會讓 cron 與「立即跑一輪」整批跳過；草稿頁手動單篇發布不受影響。</div>
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
