"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 爬蟲子系統：綁定自己的 Apify API token（owner 限定）。token 不回傳明文。
export default function ApifyForm({ bound, actor }: { bound: boolean; actor: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [actorInput, setActorInput] = useState(actor ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!token.trim()) {
      setMsg("請貼上 Apify token");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), actor: actorInput.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已綁定");
      setToken("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border px-3 py-2 text-sm";
  return (
    <div className="rounded-2xl border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">爬蟲（Apify）綁定</span>
        {bound ? (
          <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">已綁定</span>
        ) : (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-ink-2">未綁定</span>
        )}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        監看來源的爬蟲用你自己的 Apify 帳號。到 Apify → Settings → Integrations 取得 API token。
      </p>
      <div className="space-y-2">
        <input
          className={input}
          type="password"
          placeholder={bound ? "貼上新的 Apify token 以更新" : "Apify API token"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <input
          className={input}
          placeholder="Apify actor（選填，預設 igview-owner/threads-scraper-lite）"
          value={actorInput}
          onChange={(e) => setActorInput(e.target.value)}
        />
        <button
          onClick={save}
          disabled={busy}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : bound ? "更新綁定" : "綁定"}
        </button>
        {msg && <p className="text-sm text-ink-2">{msg}</p>}
      </div>
    </div>
  );
}
