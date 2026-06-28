"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { summarizePipelineRun } from "@/services/pipeline/summary";

// 手動觸發抓取：跑自己所有啟用中的來源（用自己的 Apify 金鑰），把貼文換成分潤連結後產生「素材」入庫。
// 自動抓文已改純手動，故觸發點集中在此按鈕（呼叫 /api/pipeline/run）。
export default function RunPipelineButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg("抓取中…（依來源數可能需數十秒）");
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(typeof json?.error === "string" && json.error ? json.error : `抓取失敗（HTTP ${res.status}）`);
      }
      setMsg(`✅ ${summarizePipelineRun(json?.results).message}`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={busy} className="btn btn-brand">
        {busy ? "抓取中…" : "立即抓取"}
      </button>
      {msg && <span className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</span>}
    </div>
  );
}
