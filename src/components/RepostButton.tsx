"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";

export default function RepostButton({
  materialId,
  threadsAccounts
}: {
  materialId: string;
  threadsAccounts: ThreadsAccount[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [accId, setAccId] = useState(threadsAccounts[0]?.id ?? "");
  const [vary, setVary] = useState(false);
  const [bestTime, setBestTime] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function repost(action: "draft" | "queue") {
    if (!accId) {
      setMsg("請先建立 Threads 帳號");
      return;
    }
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialId, threads_account_id: accId, action, vary, bestTime })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      const slot = json.scheduledAt
        ? new Date(json.scheduledAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short" })
        : "";
      const base = action === "queue" ? `✅ 已排入佇列（${slot}）` : "✅ 已產生草稿";
      setMsg(json.note ? `${base}；${json.note}` : base);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {threadsAccounts.length > 1 && (
        <select className="rounded border px-2 py-1 text-xs" value={accId} onChange={(e) => setAccId(e.target.value)}>
          {threadsAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={() => repost("queue")}
        disabled={!!busy}
        className="rounded bg-brand px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy === "queue" ? "…" : "再排一篇（進佇列）"}
      </button>
      <button
        onClick={() => repost("draft")}
        disabled={!!busy}
        className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
      >
        {busy === "draft" ? "…" : "存草稿"}
      </button>
      <label className="flex items-center gap-1 text-xs text-ink-2" title="用 AI＋你的文案客製化設定重寫，避免重複措辭被降觸及">
        <input type="checkbox" checked={vary} onChange={(e) => setVary(e.target.checked)} disabled={!!busy} />
        重寫文案
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-2" title="進佇列時依成效挑該帳號高觸及時段（資料不足則用預設時段）">
        <input type="checkbox" checked={bestTime} onChange={(e) => setBestTime(e.target.checked)} disabled={!!busy} />
        最佳時段
      </label>
      {/* 手機沒有 hover tooltip，補一行常駐說明 */}
      <span className="w-full text-[11px] leading-tight text-ink-3">
        「重寫文案」＝用 AI 依你的客製化設定重新生成（不勾＝沿用素材現有文案）；「最佳時段」＝進佇列時挑該帳號高觸及時段。
      </span>
      {msg && <span className="w-full text-xs text-ink-2">{msg}</span>}
    </div>
  );
}
