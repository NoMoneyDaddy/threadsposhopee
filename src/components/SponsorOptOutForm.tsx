"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface SponsorAccountRow {
  id: string;
  label: string;
  usedToday: number; // 今日已當贊助文篇數
  optOutUntil: string | null; // 臨時禁用到期 ISO（null＝正常）
}

// 帳號層級的贊助文管理（非 owner）：顯示今日已當贊助文篇數，並可臨時禁用某帳號一段時間（活動檔期用）。
export default function SponsorOptOutForm({ accounts }: { accounts: SponsorAccountRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  if (accounts.length === 0) return null;

  async function apply(accountId: string, days: number) {
    setBusy(accountId);
    setMsg(null);
    try {
      const res = await fetch("/api/sponsor/optout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, days })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(days > 0 ? "✅ 已臨時禁用贊助文" : "✅ 已恢復贊助文");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" });

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">贊助文（各帳號）</div>
      <p className="mb-2 text-xs text-ink-2">
        贊助文採比例制：依你當日發文量抽取少數幾篇替換為平台分潤連結（低頻不抽、貢獻越高抽越少）。
        下方可看各帳號今日已當贊助文篇數，並在活動檔期臨時禁用某帳號（到期自動恢復）。詳見
        <a href="/sponsored" className="ml-1 text-brand underline">贊助文規則</a>。
      </p>
      <ul className="divide-y divide-border">
        {accounts.map((a) => {
          const paused = Boolean(a.optOutUntil);
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className="truncate font-medium" translate="no">{a.label}</span>
                <span className="ml-2 text-xs text-ink-3">今日已當贊助文 {a.usedToday} 篇</span>
                {paused && <span className="ml-2 text-xs text-warn">・已禁用至 {fmt(a.optOutUntil!)}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {paused ? (
                  <button type="button" disabled={busy === a.id} onClick={() => apply(a.id, 0)} className="rounded border px-2 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">
                    恢復贊助文
                  </button>
                ) : (
                  <>
                    <span className="text-xs text-ink-3">臨時禁用</span>
                    {[7, 14, 30].map((d) => (
                      <button key={d} type="button" disabled={busy === a.id} onClick={() => apply(a.id, d)} className="rounded border px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50">
                        {d} 天
                      </button>
                    ))}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
