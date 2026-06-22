"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SponsorRewardMode } from "@/lib/store";

// 高貢獻者回饋方式選擇：免每日贊助文，或照發但換成自己的分潤連結（自己賺）。
export default function RewardModeForm({ initial }: { initial: SponsorRewardMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<SponsorRewardMode>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next: SponsorRewardMode) {
    if (next === mode || busy) return;
    setBusy(true);
    setMsg(null);
    const prev = mode;
    setMode(next);
    try {
      const res = await fetch("/api/sponsor/reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已更新");
      router.refresh();
    } catch (e) {
      setMode(prev);
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 text-sm font-medium text-ink">🎁 你的回饋方式</div>
      <p className="mb-3 text-xs text-ink-2">貢獻達門檻，可選擇每日贊助文要怎麼回饋你。</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => save("exempt")}
          className={`btn flex-1 ${mode === "exempt" ? "btn-brand" : "btn-ghost"}`}
        >
          免每日贊助文
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => save("own_link")}
          className={`btn flex-1 ${mode === "own_link" ? "btn-brand" : "btn-ghost"}`}
        >
          照發、但換成我自己的分潤連結
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {mode === "own_link"
          ? "每日贊助文會照常發，但連結用你自己的蝦皮金鑰重產，分潤算你的（需先綁定蝦皮金鑰）。"
          : "你的帳號不會被排每日平台贊助文。"}
      </p>
      {msg && <div className="mt-2 text-xs text-ink-2">{msg}</div>}
    </div>
  );
}
