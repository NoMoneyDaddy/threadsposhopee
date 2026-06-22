"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 共享庫的「匯入」按鈕：用自己的蝦皮金鑰重產分潤連結，加入自己的素材庫。
export default function ImportSharedButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已加入你的素材庫（用你自己的分潤連結）");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn btn-brand btn-sm">
        {busy ? "匯入中…" : "匯入到我的素材"}
      </button>
      {msg && <span className="text-xs text-ink-2">{msg}</span>}
    </div>
  );
}
