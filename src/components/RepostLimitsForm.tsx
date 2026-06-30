"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 每位使用者自訂「同素材重複發文上限」：單帳號上限、跨帳號合計上限。0／留空＝不限。
// 只在「加入佇列／常青回收」（承諾發文）時把關；存草稿不計。
export default function RepostLimitsForm({ initial }: { initial: { perAccount: number; total: number; evergreenDays: number } }) {
  const router = useRouter();
  const [perAccount, setPerAccount] = useState(initial.perAccount ? String(initial.perAccount) : "");
  const [total, setTotal] = useState(initial.total ? String(initial.total) : "");
  const [evergreenDays, setEvergreenDays] = useState(initial.evergreenDays ? String(initial.evergreenDays) : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/repost-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perAccount: perAccount || 0, total: total || 0, evergreenDays: evergreenDays || 0 })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已儲存");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">重複發文上限（你的設定）</div>
      <p className="mb-2 text-xs text-ink-2">
        限制「同一素材」可重複排入佇列／發布的次數，避免過度洗版被降觸及。留空或 0＝不限。
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-2">單帳號上限</label>
          <input
            className="input w-28"
            inputMode="numeric"
            placeholder="不限"
            value={perAccount}
            onChange={(e) => /^\d*$/.test(e.target.value) && setPerAccount(e.target.value)}
            aria-label="單帳號重發上限"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-2">跨帳號合計上限</label>
          <input
            className="input w-28"
            inputMode="numeric"
            placeholder="不限"
            value={total}
            onChange={(e) => /^\d*$/.test(e.target.value) && setTotal(e.target.value)}
            aria-label="跨帳號重發合計上限"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-2">常青回收間隔（天）</label>
          <input
            className="input w-28"
            inputMode="numeric"
            placeholder="預設 14"
            value={evergreenDays}
            onChange={(e) => /^\d*$/.test(e.target.value) && setEvergreenDays(e.target.value)}
            aria-label="常青回收間隔天數"
          />
        </div>
        <button onClick={save} disabled={busy} className="btn btn-brand ml-auto shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        「常青回收間隔」：設為常青的素材每隔幾天自動重排成一篇待審草稿。留空或 0＝用系統預設（14 天）。
      </p>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
