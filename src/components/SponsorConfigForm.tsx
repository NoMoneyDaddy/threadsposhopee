"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";
import type { SponsorConfig } from "@/lib/sponsor";

// owner 限定：設定贊助文（要替換進待發草稿的平台分潤連結、冷門時段、開關）。
export default function SponsorConfigForm({ initial }: { initial: SponsorConfig }) {
  const router = useRouter();
  const VARS = ["{date}", "{time}", "{platform}", "{account}", "{item}"];
  const [enabled, setEnabled] = useState(initial.enabled);
  const [start, setStart] = useState(String(initial.offPeakStart));
  const [end, setEnd] = useState(String(initial.offPeakEnd));
  const [slots, setSlots] = useState<string[]>(() => {
    const init = (initial.subIds ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 5);
    return init.length ? init : [""];
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setSlot(i: number, v: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? v.slice(0, 50) : s)));
  }
  function appendVar(i: number, tok: string) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? (s + tok).slice(0, 50) : s)));
  }
  function removeSlot(i: number) {
    setSlots((prev) => (prev.length <= 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  }
  function addSlot() {
    setSlots((prev) => (prev.length >= 5 ? prev : [...prev, ""]));
  }

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
            offPeakEnd: Number(end),
            subIds: slots.map((s) => s.trim()).filter(Boolean).join(",")
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
      <div className="mb-3 rounded-xl border border-dashed p-3">
        <div className="mb-1 text-sm font-medium">贊助連結 Sub id（套在改寫後的分潤連結上）</div>
        <p className="mb-2 text-xs text-ink-2">
          對齊蝦皮 sub_id1..5，方便在報表分辨贊助文成效。每格支援變數：
          {VARS.map((v) => (
            <code key={v} className="ml-1 font-mono">
              {v}
            </code>
          ))}
          。例：<code className="font-mono">sponsor</code> ＋ <code className="font-mono">{"{date}"}</code>。
        </p>
        <div className="space-y-2">
          {slots.map((slot, i) => (
            <div key={i}>
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-ink-3">Sub id {i + 1}</span>
                <input
                  className="min-w-0 flex-1 rounded-xl border px-3 py-1.5 text-sm"
                  placeholder="例如 sponsor"
                  value={slot}
                  maxLength={50}
                  onChange={(e) => setSlot(i, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  aria-label={`移除 Sub id ${i + 1}`}
                  title="移除"
                  className="shrink-0 rounded-lg border px-2 py-1.5 text-ink-3 hover:bg-surface-2 hover:text-danger"
                >
                  🗑
                </button>
              </div>
              <div className="ml-16 mt-1 flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => appendVar(i, v)}
                    className="rounded border border-brand/40 px-1.5 py-0.5 font-mono text-[11px] text-brand hover:bg-orange-50"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSlot}
          disabled={slots.length >= 5}
          className="mt-2 text-sm text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
        >
          ＋ 添加辨識參數 Sub id（非必填）（{slots.length}/5）
        </button>
      </div>
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
