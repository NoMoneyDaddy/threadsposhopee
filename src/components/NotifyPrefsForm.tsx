"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NOTIFY_TYPES, type NotifyPrefs } from "@/lib/notify-prefs";

// 每種通知個別開關（預設全開）。需先綁 Telegram／Discord 才會實際收到。
export default function NotifyPrefsForm({ initial }: { initial: NotifyPrefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotifyPrefs>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/notify-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs })
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
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-1 font-medium">通知開關</div>
      <p className="mb-2 text-xs text-ink-2">選擇要收到哪些通知（需先綁 Telegram／Discord）。</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {NOTIFY_TYPES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={prefs[t.key] !== false}
              onChange={(e) => setPrefs((p) => ({ ...p, [t.key]: e.target.checked }))}
            />
            {t.label}
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        {msg && <span className="text-sm text-ink-2" role="status" aria-live="polite">{msg}</span>}
      </div>
    </div>
  );
}
