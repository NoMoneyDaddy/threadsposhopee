"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-xl border px-3 py-2 text-sm";

export default function ShopeeAccountForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ label: "", app_id: "", secret: "", default_sub_id: "threadspo" });

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/shopee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setForm({ label: "", app_id: "", secret: "", default_sub_id: "threadspo" });
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
      <div className="font-medium">新增 Shopee 分潤帳號</div>
      <input className={input} placeholder="顯示名稱" value={form.label} onChange={(e) => set("label", e.target.value)} required />
      <input className={input} placeholder="App ID" value={form.app_id} onChange={(e) => set("app_id", e.target.value)} required />
      <input className={input} placeholder="Secret（會加密儲存）" value={form.secret} onChange={(e) => set("secret", e.target.value)} required />
      <input className={input} placeholder="預設 subId" value={form.default_sub_id} onChange={(e) => set("default_sub_id", e.target.value)} />
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "新增中…" : "新增帳號"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
