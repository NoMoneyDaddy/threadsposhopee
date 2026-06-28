"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Feedback, FeedbackStatus } from "@/lib/types";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已關閉"
};

// 管理員前端回覆／更新狀態：POST /api/feedback/[id]。
export default function FeedbackAdminReply({ item }: { item: Feedback }) {
  const router = useRouter();
  const [reply, setReply] = useState(item.admin_reply ?? "");
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ admin_reply: reply.trim(), status })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(typeof json?.error === "string" && json.error ? json.error : `儲存失敗（HTTP ${res.status}）`);
      }
      setMsg("已儲存");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-dashed p-3">
      <textarea
        className="w-full rounded-xl border px-3 py-2 text-sm"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="回覆使用者…"
        maxLength={4000}
        aria-label={`回覆工單：${item.title}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded-xl border px-2 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          aria-label="工單狀態"
        >
          {(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存回覆"}
        </button>
        {msg && <span className="text-xs text-ink-2" role="status">{msg}</span>}
      </div>
    </div>
  );
}
