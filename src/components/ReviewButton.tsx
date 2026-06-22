"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 審查員/管理員的下架／恢復按鈕（共享素材審核）。
export default function ReviewButton({ id, status }: { id: string; status: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(status ?? "approved");
  const removed = cur === "removed";

  async function set(next: "approved" | "removed") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/materials/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setCur(next);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return removed ? (
    <button onClick={() => set("approved")} disabled={busy} className="btn btn-ghost btn-sm">
      恢復
    </button>
  ) : (
    <button onClick={() => set("removed")} disabled={busy} className="btn btn-ghost btn-sm text-warn">
      下架
    </button>
  );
}
