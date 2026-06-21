"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RECOMMENDED_MIN_GAP_MINUTES } from "@/lib/publish-prefs";

// 每位使用者自訂發文節奏：發文時段、最小間隔、每日上限。留空沿用系統預設。
export default function PublishPrefsForm({
  initial
}: {
  initial: { slots: string[]; minGapMinutes: number; maxPerDay: number };
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial.slots.join(","));
  const [gap, setGap] = useState(String(initial.minGapMinutes));
  const [maxPerDay, setMaxPerDay] = useState(String(initial.maxPerDay));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const gapNum = Number(gap);
  const lowGap = Number.isFinite(gapNum) && gapNum > 0 && gapNum < RECOMMENDED_MIN_GAP_MINUTES;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/publish-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots, minGapMinutes: gap, maxPerDay })
      });
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
      <div className="mb-1 font-medium">發文節奏（你的設定）</div>
      <p className="mb-2 text-xs text-ink-2">
        控制「加入佇列」的發文時段，與每個發文帳號的最小間隔／每日上限。留空沿用系統預設。
      </p>
      <label className="mb-1 block text-xs text-ink-2">發文時段（HH:MM，逗號分隔；台北時間）</label>
      <input
        className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
        placeholder="09:00,12:30,20:00"
        value={slots}
        onChange={(e) => setSlots(e.target.value)}
        aria-label="發文時段"
      />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-2">最小間隔（分）</label>
          <input
            className="w-28 rounded-xl border px-3 py-2 text-sm"
            inputMode="numeric"
            value={gap}
            onChange={(e) => /^\d*$/.test(e.target.value) && setGap(e.target.value)}
            aria-label="最小間隔（分）"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-2">每日上限（每帳號）</label>
          <input
            className="w-28 rounded-xl border px-3 py-2 text-sm"
            inputMode="numeric"
            value={maxPerDay}
            onChange={(e) => /^\d*$/.test(e.target.value) && setMaxPerDay(e.target.value)}
            aria-label="每日上限"
          />
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="ml-auto shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {lowGap && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠️ 單帳號最小間隔小於 4 小時（{RECOMMENDED_MIN_GAP_MINUTES} 分），較易被判定異常而降觸及或封號。建議 ≥ 4 小時。
        </p>
      )}
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
