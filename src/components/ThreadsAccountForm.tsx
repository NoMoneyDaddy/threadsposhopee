"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "input";

export default function ThreadsAccountForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    label: "",
    access_token: "",
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
      setForm({ label: "", access_token: "", client_secret: "" });
      setMsg("✅ 已新增（已自動取得帳號資訊並設定自動續期）");
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-2 p-4">
      <div className="font-medium">手動新增 Threads 發文帳號</div>
      <p className="text-xs text-ink-2">
        貼上 access token 即可，系統會自動取得帳號 id／暱稱、把短期權杖換成長期並自動續期。
        取得 token：到{" "}
        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" className="text-brand underline">
          Meta for Developers
        </a>{" "}
        建立 Threads App → 在 <b>Threads API → Generate access token</b> 產生你帳號的權杖後貼到下方。
      </p>
      <input className={input} placeholder="顯示名稱（例：主帳號 @threadspo）" value={form.label} onChange={(e) => set("label", e.target.value)} required />
      <input className={input} placeholder="Access token（THAA...，會加密儲存）" value={form.access_token} onChange={(e) => set("access_token", e.target.value)} required />
      <input className={input} type="password" placeholder="App 密鑰 client secret（選填，填了才能把短期權杖換成長期）" value={form.client_secret} onChange={(e) => set("client_secret", e.target.value)} />
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn btn-brand">
          {busy ? "新增中…" : "新增帳號"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
