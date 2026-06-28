"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedbackKind } from "@/lib/types";

const input = "w-full rounded-xl border px-3 py-2 text-sm";

// 使用者送出意見回饋／工單：選類型（bug/功能建議）＋標題＋內容 → POST /api/feedback。
export default function FeedbackForm() {
  const router = useRouter();
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setMsg("請填寫標題與內容");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, title: title.trim(), message: message.trim() })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(typeof json?.error === "string" && json.error ? json.error : `送出失敗（HTTP ${res.status}）`);
      }
      setTitle("");
      setMessage("");
      setMsg("已送出，感謝你的回饋！");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="fb-kind" className="text-sm text-ink-2">
          類型
        </label>
        <select
          id="fb-kind"
          className="rounded-xl border px-2 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as FeedbackKind)}
        >
          <option value="feature">💡 功能建議</option>
          <option value="bug">🐞 問題回報</option>
        </select>
      </div>
      <input
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="標題（簡述你的建議或問題）"
        maxLength={120}
        aria-label="標題"
      />
      <textarea
        className={input + " min-h-[96px]"}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="詳細說明：想要的功能、重現步驟、或遇到的狀況…"
        maxLength={4000}
        aria-label="內容"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "送出中…" : "送出回饋"}
        </button>
        {msg && <span className="text-xs text-ink-2" role="status">{msg}</span>}
      </div>
    </form>
  );
}
