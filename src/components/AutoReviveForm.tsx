"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 連結失效時自動替換為有效分潤連結（用已存的商品原始連結重產）。預設關。
export default function AutoReviveForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setMsg(null);
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch("/api/accounts/auto-revive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已儲存");
      router.refresh();
    } catch (e) {
      setEnabled(prev);
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">連結失效自動替換（選填）</div>
      <p className="mb-2 text-xs text-ink-2">
        開啟後：分潤連結被偵測失效時，系統用資料庫保存的<b>商品原始連結</b>自動重產有效分潤連結。
        關閉（預設）則只標記失效、不自動重產（交由你決定）。
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        失效時自動替換為有效分潤連結
      </label>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
