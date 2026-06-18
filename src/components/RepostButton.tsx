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
  const [busy, setBusy] = useState(false);
  const [accId, setAccId] = useState(threadsAccounts[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  async function repost() {
    if (!accId) {
      setMsg("請先建立 Threads 帳號");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialId, threads_account_id: accId })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已產生草稿");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
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
        onClick={repost}
        disabled={busy}
        className="rounded border px-3 py-1 text-xs text-shopee hover:bg-orange-50 disabled:opacity-50"
      >
        {busy ? "…" : "再排一篇"}
      </button>
      {msg && <span className="text-xs text-neutral-500">{msg}</span>}
    </div>
  );
}
