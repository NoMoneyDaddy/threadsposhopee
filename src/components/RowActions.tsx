"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 通用刪除按鈕：確認後對 endpoint 發 DELETE，成功則重新整理。
export function DeleteButton({
  endpoint,
  label = "刪除",
  confirm: confirmMsg = "確定要刪除嗎？此動作無法復原。"
}: {
  endpoint: string;
  label?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      alert(`刪除失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onDelete} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-50">
      {busy ? "處理中…" : label}
    </button>
  );
}

// 通用切換按鈕：對 endpoint 發 PATCH(body)，成功則重新整理。
export function ToggleButton({
  endpoint,
  body,
  label
}: {
  endpoint: string;
  body: Record<string, unknown>;
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      router.refresh();
    } catch (e) {
      alert(`操作失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={onClick} disabled={busy} className="text-xs text-ink-2 hover:underline disabled:opacity-50">
      {busy ? "處理中…" : label}
    </button>
  );
}
