"use client";

import { useState } from "react";
import type { FeatureFlags } from "@/lib/store";

const LABELS: { key: keyof FeatureFlags; label: string; hint: string }[] = [
  { key: "shared", label: "共享素材庫", hint: "關閉後使用者無法分享/匯入共享素材" },
  { key: "leaderboard", label: "貢獻排行榜", hint: "共享庫頂部的排行榜展示" },
  { key: "favorites", label: "收藏功能", hint: "使用者可收藏共享素材" }
];

// 熱設定站台旗標（存 DB，改了即時生效、不隨重新部署消失）。
export default function FeatureFlagsForm({ initial }: { initial: FeatureFlags }) {
  const [flags, setFlags] = useState<FeatureFlags>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(key: keyof FeatureFlags) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next[key] })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setFlags(json.flags);
      setMsg("✅ 已更新");
    } catch (e) {
      setFlags(flags);
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">站台功能開關</h2>
      <p className="mb-3 text-sm text-ink-2">即時生效，存於資料庫，不會因重新部署消失。</p>
      <div className="space-y-2">
        {LABELS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <span>
              <span className="text-sm font-medium text-ink">{f.label}</span>
              <span className="block text-xs text-ink-3">{f.hint}</span>
            </span>
            <input
              type="checkbox"
              checked={flags[f.key]}
              disabled={busy}
              onChange={() => toggle(f.key)}
              className="h-5 w-5 accent-brand"
            />
          </label>
        ))}
      </div>
      {msg && <div className="mt-2 text-xs text-ink-2">{msg}</div>}
    </div>
  );
}
