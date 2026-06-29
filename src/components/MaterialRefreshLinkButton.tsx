"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 刷新單筆素材的分潤連結：用當前 Shopee 金鑰＋當前 Sub id 設定重產（不必重抓整筆）。
export default function MaterialRefreshLinkButton({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/refresh-link`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" ? json.error : `刷新失敗（HTTP ${res.status}）`);
      setMsg("✅ 已更新");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        title="用目前的 Shopee 金鑰與 Sub id 設定重產分潤連結（改了 subId、或連結失效時用）"
        className="rounded border px-3 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "刷新中…" : "🔄 刷新分潤連結"}
      </button>
      {msg && <span className="text-xs text-ink-3">{msg}</span>}
    </span>
  );
}
