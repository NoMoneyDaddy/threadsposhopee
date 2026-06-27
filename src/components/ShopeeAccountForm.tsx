"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "input";

export default function ShopeeAccountForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ app_id: "", secret: "" });

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
      setForm({ app_id: "", secret: "" });
      setMsg(json.warning ? `⚠️ ${json.warning}` : "✅ 已新增");
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-2 p-4">
      <div className="font-medium">綁定 Shopee 分潤帳號</div>
      <p className="text-xs text-ink-2">
        每位使用者僅綁定一組。只需蝦皮分潤的 <b>App ID</b> 與 <b>Secret</b>（來源標記請用上方的「Sub id」設定）。取得方式：登入{" "}
        <a href="https://affiliate.shopee.tw/open_api" target="_blank" rel="noopener" className="text-brand underline">
          蝦皮分潤平台 → Open API
        </a>{" "}
        申請後即可看到 App ID 與 Secret Key。重複綁定會覆寫既有金鑰。
      </p>
      <input className={input} placeholder="App ID" value={form.app_id} onChange={(e) => set("app_id", e.target.value)} required />
      <input className={input} type="password" placeholder="Secret（會加密儲存）" value={form.secret} onChange={(e) => set("secret", e.target.value)} required />
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn btn-brand">
          {busy ? "綁定中…" : "綁定帳號"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
