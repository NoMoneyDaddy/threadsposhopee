"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 一鍵重試所有發布失敗的草稿（重置回 approved 重進佇列）。
// token 中斷或暫時性錯誤造成一批失敗時，免逐筆點重試。
export default function RetryFailedBar({ failedIds }: { failedIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (failedIds.length === 0) return null;

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/drafts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: failedIds, action: "retry" })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 已重新排入佇列 ${json.done} 則${json.errors?.length ? `（${json.errors.length} 則略過）` : ""}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border-l-4 border-red-500 bg-red-50 p-3">
        <span className="text-lg" aria-hidden>⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-900">{failedIds.length} 則貼文發布失敗</p>
          <p className="text-xs text-red-800">多半是暫時性錯誤（如授權過期或網路），可直接重新排入佇列再試。</p>
        </div>
        <button
          disabled={busy}
          onClick={run}
          className="shrink-0 rounded-xl bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "處理中…" : "全部重新發布"}
        </button>
      </div>
      {/* 執行結果獨立於上方 alert：成功用 status、失敗才 alert，避免成功被輔助技術當成錯誤宣告。 */}
      {msg && (
        <span role={msg.startsWith("❌") ? "alert" : "status"} className="block text-sm text-ink-2">
          {msg}
        </span>
      )}
    </div>
  );
}
