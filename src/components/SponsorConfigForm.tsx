"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";
import type { SponsorConfig } from "@/lib/sponsor";

// owner 限定：設定贊助文（要替換進待發草稿的平台分潤連結、冷門時段、開關）。
export default function SponsorConfigForm({ initial }: { initial: SponsorConfig }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [start, setStart] = useState(String(initial.offPeakStart));
  const [end, setEnd] = useState(String(initial.offPeakEnd));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout(
        "/api/sponsor/config",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled,
            offPeakStart: Number(start),
            offPeakEnd: Number(end)
          })
        },
        10000
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已儲存");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">贊助文（管理者）</div>
      <p className="mb-2 text-xs text-ink-2">
        非管理者帳號每天 1 篇於冷門時段，<b>自動把該篇貼文裡的分潤連結，用你的蝦皮金鑰就地改寫成你的分潤連結</b>
        （保留原商品、只換分潤歸屬），發後驗證仍在。不需另外設定商品或連結。
        規則見 <a href="/sponsored" className="text-brand underline">《贊助文規則》</a>。
      </p>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        啟用贊助文
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">冷門時段（台北時間，時）</span>
        <input
          className="w-16 rounded-xl border px-2 py-1"
          inputMode="numeric"
          value={start}
          onChange={(e) => /^\d*$/.test(e.target.value) && setStart(e.target.value)}
          aria-label="冷門時段起"
        />
        <span>–</span>
        <input
          className="w-16 rounded-xl border px-2 py-1"
          inputMode="numeric"
          value={end}
          onChange={(e) => /^\d*$/.test(e.target.value) && setEnd(e.target.value)}
          aria-label="冷門時段迄"
        />
        <button
          onClick={save}
          disabled={busy}
          className="ml-auto shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
