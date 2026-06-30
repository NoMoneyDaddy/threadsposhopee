"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";

export default function RepostButton({
  materialId,
  threadsAccounts,
  beforeRepost
}: {
  materialId: string;
  threadsAccounts: ThreadsAccount[];
  // 重排前的前置動作（如：把展開中的文案編輯器存檔並收合）。拋錯則中止重排。
  beforeRepost?: () => Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [accId, setAccId] = useState(threadsAccounts[0]?.id ?? "");
  const [vary, setVary] = useState(false);
  // 智慧時段預設開：依該帳號成效最佳時段排程（資料不足自動退回預設時段）。取消＝改用固定預設時段。
  const [bestTime, setBestTime] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function repost(action: "draft" | "queue") {
    if (!accId) {
      setMsg("❌ 請先建立 Threads 帳號");
      return;
    }
    setBusy(action);
    setMsg(null);
    try {
      // 先把展開中的編輯器存檔並收合（若有），確保重排用到的是最新文案。
      if (beforeRepost) await beforeRepost();
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
      // 指向結果所在欄位：新草稿會出現在另一欄（手機需橫向滑），明說去哪看避免「動作完成但結果在視野外」。
      const base =
        action === "queue"
          ? `✅ 已排入佇列${slot ? `（${slot}）` : ""}，請看右側「已排程」欄`
          : "✅ 已產生草稿，請看「草稿」欄";
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
        <select
          className="rounded border px-2 py-1 text-xs"
          value={accId}
          onChange={(e) => setAccId(e.target.value)}
          aria-label="發到哪個帳號"
        >
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
        className="rounded bg-brand px-3 py-2 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy === "queue" ? "排程中…" : "再排一篇（進佇列）"}
      </button>
      <button
        onClick={() => repost("draft")}
        disabled={!!busy}
        className="rounded border px-3 py-2 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
      >
        {busy === "draft" ? "存草稿中…" : "存草稿"}
      </button>
      <label className="flex items-center gap-1 text-xs text-ink-2" title="用 AI＋你的文案客製化設定重寫，避免重複措辭被降觸及">
        <input type="checkbox" checked={vary} onChange={(e) => setVary(e.target.checked)} disabled={!!busy} />
        重寫文案
      </label>
      <label className="flex items-center gap-1 text-xs text-ink-2" title="預設開：依該帳號成效挑高觸及時段並分散一整天（資料不足自動退回預設時段）">
        <input type="checkbox" checked={bestTime} onChange={(e) => setBestTime(e.target.checked)} disabled={!!busy} />
        智慧時段（依成效）
      </label>
      {/* 手機沒有 hover tooltip，補一行常駐說明 */}
      <span className="w-full text-[11px] leading-tight text-ink-3">
        「重寫文案」＝用 AI 依你的客製化設定重新生成（不勾＝沿用素材現有文案）；「智慧時段」預設開＝依成效挑高觸及時段並分散一整天（取消＝用固定預設時段）。
      </span>
      {msg && (
        <span
          className={"w-full text-xs " + (msg.startsWith("❌") ? "text-red-600" : "text-ink-2")}
          role={msg.startsWith("❌") ? "alert" : "status"}
          aria-live="polite"
        >
          {msg}
        </span>
      )}
    </div>
  );
}
