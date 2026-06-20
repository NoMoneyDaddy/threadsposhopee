"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";

// 常青回收：把素材庫所有有效素材一次排入佇列（單次上限 50）。
export default function BulkRepostButton({ threadsAccounts }: { threadsAccounts: ThreadsAccount[] }) {
  const router = useRouter();
  const [accId, setAccId] = useState(threadsAccounts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (threadsAccounts.length === 0) return null;

  async function run() {
    if (!accId) return;
    if (!confirm("把所有有效素材排入佇列？（最多 50 筆，依空時段排程）")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/repost-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threads_account_id: accId })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 已排入 ${json.queued} 篇${json.full ? "（時段已滿，剩餘未排）" : ""}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {threadsAccounts.length > 1 && (
        <select className="rounded border px-2 py-1 text-sm" value={accId} onChange={(e) => setAccId(e.target.value)}>
          {threadsAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-shopee/40 px-3 py-1.5 text-sm text-shopee hover:bg-orange-50 disabled:opacity-50"
      >
        {busy ? "排入中…" : "全部再排（常青回收）"}
      </button>
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
    </div>
  );
}
