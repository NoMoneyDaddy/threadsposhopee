"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 無 Shopee Open API 的人：填 affiliate_id 就能自組 an_redir 追蹤連結（免申請 API）。
export default function AffiliateIdForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [id, setId] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/shopee-affiliate-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ affiliate_id: id.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(id.trim() ? "✅ 已儲存" : "✅ 已清除");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">分潤連結（免 API）</div>
      <p className="mb-2 text-xs text-ink-2">
        沒有蝦皮分潤 API 也能追蹤：填你的分潤 ID，系統會自動幫每個連結加上來源標記，方便在蝦皮報表分辨成效。
        若上方已綁 Shopee API，會優先用 API。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          inputMode="numeric"
          aria-label="Shopee affiliate_id"
          placeholder="affiliate_id（純數字，如 16308730014）"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <button onClick={save} disabled={busy} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
