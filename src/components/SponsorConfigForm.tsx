"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";
import type { SponsorConfig } from "@/lib/sponsor";

// owner 限定：設定贊助文（要替換進待發草稿的平台分潤連結、冷門時段、開關）。
export default function SponsorConfigForm({ initial }: { initial: SponsorConfig }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [productUrl, setProductUrl] = useState(initial.productUrl);
  const [link, setLink] = useState(initial.affiliateLink);
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
            productUrl: productUrl.trim(),
            affiliateLink: link.trim(),
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
        非管理者帳號每天 1 篇於冷門時段，把該篇待發草稿的分潤連結暫時替換為下方平台連結後發布、發後還原。
        規則見 <a href="/sponsored" className="text-brand underline">《贊助文規則》</a>。
      </p>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        啟用贊助文
      </label>
      <input
        className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
        placeholder="商品原始連結（建議；系統會即時轉每帳號 sp_ 分潤連結，可追來源）"
        value={productUrl}
        onChange={(e) => setProductUrl(e.target.value)}
        inputMode="url"
        aria-label="商品原始連結"
      />
      <input
        className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
        placeholder="後備靜態分潤連結（選填；無法每帳號追蹤）"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        inputMode="url"
        aria-label="後備分潤連結"
      />
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
