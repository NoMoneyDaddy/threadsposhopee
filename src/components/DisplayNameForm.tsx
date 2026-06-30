"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 會員平台暱稱：站內顯示用名稱（頂部 header、貢獻排行榜優先顯示），未設則顯示 email。
// 可含中文與空白，上限 24 字（伺服器端再正規化一次）。清空輸入＝改回顯示 email。
export default function DisplayNameForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile/display-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setName(json.displayName ?? "");
      setMsg(json.displayName ? "✅ 已儲存" : "✅ 已清除（將顯示 email）");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">會員暱稱</span>
      </div>
      <p className="mb-2 text-xs text-ink-2">
        設定後，頂部列與貢獻排行榜會顯示這個暱稱（取代 email）。可含中文與空白，上限 24 字；留空則改回顯示 email。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          maxLength={24}
          placeholder="例如：小明、海島選物"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button onClick={save} disabled={busy || name.trim() === (initial ?? "")} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-2 text-xs text-ink-2">{msg}</p>}
    </div>
  );
}
