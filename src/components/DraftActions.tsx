"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DraftActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "approve" | "reject" | "publish") {
    setBusy(true);
    try {
      await fetch("/api/drafts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action })
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "published") return <span className="text-xs text-green-600">已發布</span>;
  if (status === "rejected") return <span className="text-xs text-neutral-400">已退回</span>;

  return (
    <div className="flex gap-2">
      <button
        disabled={busy}
        onClick={() => act("publish")}
        className="rounded bg-shopee px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
      >
        核准並發布
      </button>
      <button
        disabled={busy}
        onClick={() => act("reject")}
        className="rounded border px-3 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
      >
        退回
      </button>
    </div>
  );
}
