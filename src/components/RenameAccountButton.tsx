"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 改自訂暱稱（label，顯示用，不影響 Threads 帳號本身）。
export default function RenameAccountButton({ endpoint, current }: { endpoint: string; current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onRename() {
    const label = window.prompt("輸入新的暱稱（顯示用，不影響 Threads 帳號）", current)?.trim();
    if (!label || label === current) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      alert(`改名失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onRename} disabled={busy} className="text-xs text-ink-2 hover:underline disabled:opacity-50">
      {busy ? "處理中…" : "改暱稱"}
    </button>
  );
}
