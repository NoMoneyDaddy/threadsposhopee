"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// AI 子系統：綁定自己的 Gemini API key。key 不回傳明文。
export default function GeminiForm({ bound }: { bound: boolean }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!key.trim()) {
      setMsg("請貼上 Gemini API key");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已綁定");
      setKey("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">AI 文案（Gemini）綁定</span>
        {bound ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已綁定</span>
        ) : (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">未綁定</span>
        )}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        AI 文案用你自己的 Gemini API key。到 Google AI Studio（aistudio.google.com）取得。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
          type="password"
          placeholder={bound ? "貼上新的 key 以更新" : "Gemini API key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          onClick={save}
          disabled={busy}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : bound ? "更新" : "綁定"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
