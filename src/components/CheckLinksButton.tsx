"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 立即檢查本人素材的分潤連結；失效者即時嘗試自動重產。
export default function CheckLinksButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/check-links", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(`✅ 檢查 ${json.checked} 條：重產 ${json.revived}、仍失效 ${json.dead}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "檢查中…" : "立即檢查連結"}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </div>
  );
}
