"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunPipelineButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pipeline/run", { method: "POST" });
      const json = await res.json();
      const created = (json.results ?? []).reduce((s: number, r: any) => s + r.created, 0);
      setMsg(`完成：新增 ${created} 則草稿`);
      router.refresh();
    } catch (e: any) {
      setMsg(`失敗：${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={loading}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "執行中…" : "▶ 立即跑一次（爬 → 換連結 → AI 文案）"}
      </button>
      {msg && <span className="text-sm text-ink-2">{msg}</span>}
    </div>
  );
}
