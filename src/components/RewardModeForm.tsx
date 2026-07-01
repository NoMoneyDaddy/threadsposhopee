"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SponsorRewardMode } from "@/lib/store";
import { SPONSOR_EXEMPT_CONTRIBUTION, OWN_LINK_CONTRIBUTION } from "@/lib/contribution";

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
      <div className="mb-1 text-sm font-medium text-ink">🎁 你的贊助回饋方式</div>
      <p className="mb-3 text-xs text-ink-2">
        貢獻越高，贊助文抽成自動越少（平台保底不歸零）。達 {OWN_LINK_CONTRIBUTION} 分可再選「換成自己連結賺分潤」。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => save("exempt")}
          className={`btn flex-1 ${mode === "exempt" ? "btn-brand" : "btn-ghost"}`}
        >
          平台連結（依貢獻自動減量）
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => save("own_link")}
          className={`btn flex-1 ${mode === "own_link" ? "btn-brand" : "btn-ghost"}`}
        >
          換成我自己的分潤連結（自賺）
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        {mode === "own_link"
          ? `連結自賺：保底篇仍走平台（平台保本），超過保底的贊助篇換成你自己的蝦皮分潤連結、分潤算你的（需綁蝦皮金鑰，且貢獻達 ${OWN_LINK_CONTRIBUTION} 分）。`
          : `平台連結：贊助文用平台分潤連結，且依你的貢獻自動減少抽取比例（貢獻達 ${SPONSOR_EXEMPT_CONTRIBUTION} 分起明顯變少）。`}
      </p>
      {msg && <div className="mt-2 text-xs text-ink-2">{msg}</div>}
    </div>
  );
}
