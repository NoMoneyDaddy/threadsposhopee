"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 素材卡的「分享到共享庫」開關。分享的是商品（名稱/圖/文案/原始連結），不含你的分潤連結。
export default function ShareToggle({ materialId, initial }: { materialId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    try {
      const res = await fetch("/api/materials/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialId, on: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      title="分享商品到共享庫（不含你的分潤連結）；別人匯入會用他自己的金鑰產生連結"
      className={
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
        (on ? "bg-info/10 text-info" : "bg-surface-2 text-ink-2 hover:bg-neutral-200")
      }
    >
      {on ? "🔗 已分享" : "分享到共享庫"}
    </button>
  );
}
