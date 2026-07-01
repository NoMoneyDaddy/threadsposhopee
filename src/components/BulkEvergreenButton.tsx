"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 批次常青：把素材庫所有已入庫素材一次設為「常青回收」（每約 14 天自動重排成待審草稿，仍人工核准）。
// 預設不開常青；想讓爆款好物長期自動回收時，用這顆一次打開。
export default function BulkEvergreenButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (!confirm("把素材庫所有素材設為常青回收？\n（每約 14 天自動重排成待審草稿，仍需你核准才會發；可在「設定」調整間隔，或逐筆關閉）")) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/evergreen-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: true })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 已將 ${json.updated} 筆素材設為常青回收`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        title="把素材庫所有素材設為常青回收（每約 14 天自動重排成待審草稿，仍人工核准）"
        className="rounded-xl border border-success/40 px-3 py-1.5 text-sm text-success hover:bg-green-50 disabled:opacity-50"
      >
        {busy ? "設定中…" : "♻️ 全部設為常青"}
      </button>
      {msg && (
        <span
          className={"text-xs " + (msg.startsWith("❌") ? "text-red-600" : "text-ink-2")}
          role={msg.startsWith("❌") ? "alert" : "status"}
          aria-live="polite"
        >
          {msg}
        </span>
      )}
    </div>
  );
}
