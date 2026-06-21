"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 自訂分潤 subId：套用到「API 轉換短連結」與「an_redir 長連結」兩種分潤連結（蝦皮報表依此分流）。
export default function SubIdForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [subId, setSubId] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/shopee-sub-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: subId })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSubId(json.subId ?? "");
      setMsg(json.subId ? "✅ 已儲存" : "✅ 已清除");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">自訂分潤 subId（選填）</div>
      <p className="mb-2 text-xs text-ink-2">
        套用到你的 API 短連結與 an_redir 長連結，蝦皮分潤報表會依此 subId 分流統計。
        留空＝用預設。<b>僅能含英數與底線</b>、長度上限 50（依官方規範）。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
          aria-label="自訂分潤 subId"
          placeholder="例如 myshop_2026"
          value={subId}
          onChange={(e) => setSubId(e.target.value)}
          maxLength={50}
        />
        <button
          onClick={save}
          disabled={busy}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
