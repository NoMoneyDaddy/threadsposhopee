"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BoundKeyHint from "@/components/BoundKeyHint";

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
    <div className="card p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium">AI 自動寫文案（Google Gemini）</span>
        {bound ? (
          <span className="badge-success">已綁定</span>
        ) : (
          <span className="badge-neutral">未綁定</span>
        )}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        綁定後系統會用 Gemini 幫你的商品自動產生貼文文案，金鑰免費、用你自己的額度。
      </p>
      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noopener"
        className="mb-2 inline-flex items-center gap-1 rounded-lg border border-brand/40 px-2.5 py-1 text-xs font-medium text-brand hover:bg-orange-50"
      >
        前往 Google AI Studio 取得免費 API key ↗
      </a>
      {bound && <BoundKeyHint />}
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          type="password"
          placeholder={bound ? "貼上新的 key 以更新" : "Gemini API key"}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          onClick={save}
          disabled={busy}
          className="btn btn-brand shrink-0"
        >
          {busy ? "儲存中…" : bound ? "更新" : "綁定"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
