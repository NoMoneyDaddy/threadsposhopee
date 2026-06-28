"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteButton } from "@/components/RowActions";
import type { ShopeeAccount } from "@/lib/types";

const input = "input";

// 每位使用者僅一組 Shopee 分潤帳號：綁定／覆寫／解除都在這個表單內，不另設帳號列表區塊。
export default function ShopeeAccountForm({ bound = null }: { bound?: ShopeeAccount | null }) {
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
      // 防呆：error 非字串時不要讓樣板顯示成 [object Object]
      if (!json.ok) throw new Error(typeof json.error === "string" && json.error ? json.error : "綁定失敗");
      setForm({ app_id: "", secret: "" });
      setMsg(json.warning ? `⚠️ ${json.warning}` : "✅ 已綁定");
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
      {bound && (
        <div className="rounded-xl border bg-surface-2/40 p-2 text-sm">
          <div className="text-ink-2">
            目前已綁定 · App ID <span translate="no" className="font-medium text-ink">{bound.app_id}</span>
          </div>
          {bound.default_sub_id && (
            <div className="text-ink-2">
              預設分潤標記（subId）：<span translate="no">{bound.default_sub_id}</span>
            </div>
          )}
          <div className="mt-1">
            <DeleteButton endpoint={`/api/accounts/shopee/${bound.id}`} label="解除綁定" confirm="確定解除 Shopee 分潤綁定？" />
          </div>
        </div>
      )}
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
