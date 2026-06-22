"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Link-in-bio 設定：設公開代稱（handle）與標題，產生 /b/<handle> 公開頁。
export default function BioSettingsForm({ initialHandle, initialTitle }: { initialHandle: string | null; initialTitle: string | null }) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle ?? "");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim(), title: title.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(json.handle ? "✅ 已儲存" : "✅ 已關閉 bio 頁");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const url = handle.trim() ? `${typeof window !== "undefined" ? window.location.origin : ""}/b/${handle.trim().toLowerCase()}` : "";

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">Link-in-bio 頁（選填）</div>
      <p className="mb-2 text-xs text-ink-2">
        設一個代稱，產生一頁集合多個短連結的公開頁，放在 Threads／IG 個人簡介。下方每個短連結可勾「加入 bio」。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          aria-label="bio 代稱"
          placeholder="代稱（英數/底線/連字號，3–30）"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={30}
        />
        <input
          className="input min-w-0 flex-1"
          aria-label="bio 標題"
          placeholder="頁面標題（選填）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
        />
        <button onClick={save} disabled={busy} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {url && (
        <p className="mt-2 break-all text-xs text-ink-3">
          公開頁：<a href={url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{url}</a>
        </p>
      )}
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
