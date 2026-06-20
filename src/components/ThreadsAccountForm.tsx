"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-xl border px-3 py-2 text-sm";

export default function ThreadsAccountForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    threads_user_id: "",
    access_token: "",
    token_expires_at: "",
    client_secret: ""
  });

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setForm({ label: "", threads_user_id: "", access_token: "", token_expires_at: "", client_secret: "" });
      setMsg("✅ 已新增");
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border bg-surface p-4">
      <div className="font-medium">新增 Threads 發文帳號</div>
      <input className={input} placeholder="顯示名稱（例：主帳號 @threadspo）" value={form.label} onChange={(e) => set("label", e.target.value)} required />
      <input className={input} placeholder="Threads user id（數字）" value={form.threads_user_id} onChange={(e) => set("threads_user_id", e.target.value)} required />
      <input className={input} placeholder="Access token（THAA...，會加密儲存）" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} />
      <input className={input} type="date" title="長期 token 到期日（選填）" value={form.token_expires_at} onChange={(e) => set("token_expires_at", e.target.value)} />
      <input className={input} placeholder="App client secret（選填，用於自動展期）" value={form.client_secret} onChange={(e) => set("client_secret", e.target.value)} />
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "新增中…" : "新增帳號"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
