"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 管理員：把某帳號永久排除贊助（濫用/高風險）或解除。
export default function SponsorBlockButton({ accountId, initialBlocked }: { accountId: string; initialBlocked: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !blocked;
    if (next && !confirm("把此帳號永久排除贊助文？（濫用/高風險帳號）")) return;
    setBusy(true);
    setBlocked(next);
    try {
      const res = await fetch("/api/sponsor/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, blocked: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "設定失敗，請稍後再試");
      setBlocked(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        "rounded border px-2 py-0.5 text-xs disabled:opacity-50 " +
        (blocked ? "border-red-300 bg-red-50 text-red-600" : "text-ink-3 hover:bg-surface-2")
      }
      title={blocked ? "已排除贊助，點擊解除" : "永久排除此帳號的贊助文"}
    >
      {blocked ? "已封鎖贊助" : "封鎖贊助"}
    </button>
  );
}
