"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 一鍵重試所有失敗／卡住的草稿（重置回 approved 重進佇列）。
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
      setMsg(`✅ 已重排 ${json.done} 則${json.errors?.length ? `（${json.errors.length} 則略過）` : ""}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <span className="text-sm text-amber-800">{failedIds.length} 則發布失敗／卡住：</span>
      <button
        disabled={busy}
        onClick={run}
        className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-50"
      >
        {busy ? "重排中…" : "全部重試（重排）"}
      </button>
      {msg && <span className="text-sm text-neutral-600">{msg}</span>}
    </div>
  );
}
