"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 素材卡上的「常青回收」開關：開啟後系統每約 14 天自動把這個素材重排成待審草稿（仍人工核准），
// 重用既有連結/文案、不重燒 token。爆款好物可自動重炒。
export default function EvergreenToggle({ materialId, initial }: { materialId: string; initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next); // 樂觀更新
    try {
      const res = await fetch("/api/materials/evergreen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_id: materialId, on: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch {
      setOn(!next); // 失敗回滾
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
      title="開啟後每約 14 天自動重排成待審草稿（重用連結/文案，不重燒 token）"
      className={
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
        (on ? "bg-success/10 text-success" : "bg-surface-2 text-ink-2 hover:bg-neutral-200")
      }
    >
      {on ? "♻️ 常青回收中" : "♻️ 設為常青"}
    </button>
  );
}
