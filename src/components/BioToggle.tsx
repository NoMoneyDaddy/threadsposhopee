"use client";

import { useState } from "react";

// 每個短連結的「加入 bio」開關。
export default function BioToggle({ code, initial }: { code: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setOn(next);
    try {
      const res = await fetch("/api/redirect/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, on: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
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
      title="是否顯示在你的 bio 頁"
      className={
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
        (on ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-2 hover:bg-neutral-200")
      }
    >
      {on ? "★ 在 bio" : "加入 bio"}
    </button>
  );
}
