"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 批次操作待審草稿的工具列：一次核准／加入佇列／退回／刪除多筆，省去逐筆點擊。
export default function BulkDraftBar({ draftIds }: { draftIds: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (draftIds.length === 0) return null;

  async function run(action: "approve" | "queue" | "reject" | "delete", label: string) {
    if ((action === "delete" || action === "reject") && !confirm(`確定要${label} ${draftIds.length} 則待審草稿？`)) return;
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/drafts/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: draftIds, action })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 已${label} ${json.done} 則${json.errors?.length ? `（${json.errors.length} 則失敗）` : ""}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3">
      <span className="text-sm text-neutral-500">{draftIds.length} 則待審：</span>
      <button disabled={!!busy} onClick={() => run("approve", "核准")} className={btn}>
        全部核准
      </button>
      <button
        disabled={!!busy}
        onClick={() => run("queue", "加入佇列")}
        className="rounded-md border border-shopee/40 px-3 py-1.5 text-sm text-shopee hover:bg-orange-50 disabled:opacity-50"
      >
        全部加入佇列
      </button>
      <button disabled={!!busy} onClick={() => run("reject", "退回")} className={btn}>
        全部退回
      </button>
      <button
        disabled={!!busy}
        onClick={() => run("delete", "刪除")}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        全部刪除
      </button>
      {msg && <span className="text-sm text-neutral-600">{msg}</span>}
    </div>
  );
}
