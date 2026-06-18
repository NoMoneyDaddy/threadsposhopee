"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShopeeAccount, ThreadsAccount } from "@/lib/types";

const input = "w-full rounded-md border px-3 py-2 text-sm";

export default function SourceForm({
  threadsAccounts,
  shopeeAccounts
}: {
  threadsAccounts: ThreadsAccount[];
  shopeeAccounts: ShopeeAccount[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    source_username: "",
    threads_account_id: threadsAccounts[0]?.id ?? "",
    shopee_account_id: shopeeAccounts[0]?.id ?? "",
    poll_interval_minutes: "15",
    posts_limit: "1",
    auto_publish: false
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已新增來源");
      router.refresh();
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (threadsAccounts.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-neutral-500">請先到「帳號管理」新增至少一個 Threads 發文帳號，才能建立來源。</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border bg-white p-4 md:grid-cols-2">
      <div className="font-medium md:col-span-2">新增監看來源</div>
      <input className={input} placeholder="來源 Threads 帳號（@username）" value={form.source_username} onChange={(e) => set("source_username", e.target.value)} required />
      <select className={input} value={form.threads_account_id} onChange={(e) => set("threads_account_id", e.target.value)}>
        {threadsAccounts.map((a) => (
          <option key={a.id} value={a.id}>發文到：{a.label}</option>
        ))}
      </select>
      <select className={input} value={form.shopee_account_id} onChange={(e) => set("shopee_account_id", e.target.value)}>
        <option value="">不指定 Shopee 帳號</option>
        {shopeeAccounts.map((a) => (
          <option key={a.id} value={a.id}>Shopee：{a.label}</option>
        ))}
      </select>
      <input className={input} type="number" min={1} title="輪詢間隔（分鐘）" value={form.poll_interval_minutes} onChange={(e) => set("poll_interval_minutes", e.target.value)} />
      <input className={input} type="number" min={1} title="每次抓幾篇" value={form.posts_limit} onChange={(e) => set("posts_limit", e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={form.auto_publish} onChange={(e) => set("auto_publish", e.target.checked)} />
        全自動發布（不勾＝進審核佇列，較安全）
      </label>
      <div className="flex items-center gap-3 md:col-span-2">
        <button disabled={busy} className="rounded-md bg-shopee px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "新增中…" : "新增來源"}
        </button>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>
    </form>
  );
}
