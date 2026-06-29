"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShopeeAccount, ThreadsAccount } from "@/lib/types";

const input = "w-full rounded-xl border px-3 py-2 text-sm";

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
    search_query: "",
    threads_account_id: threadsAccounts[0]?.id ?? "",
    shopee_account_id: "",
    poll_interval_minutes: "15",
    posts_limit: "1",
    auto_publish: false
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.source_username.trim() && !form.search_query.trim()) {
      setMsg("❌ 帳號或關鍵字至少填一個");
      return;
    }
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
    return <p className="rounded-2xl border border-dashed p-4 text-sm text-ink-2">請先到「帳號管理」新增至少一個 Threads 發文帳號，才能建立來源。</p>;
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-2xl border bg-surface p-4 md:grid-cols-2">
      <div className="font-medium md:col-span-2">新增監看來源</div>
      <input className={input} placeholder="來源 Threads 帳號（@username）" value={form.source_username} onChange={(e) => set("source_username", e.target.value)} />
      <input className={input} placeholder="或：搜尋關鍵字（如「蝦皮 零食」）" value={form.search_query} onChange={(e) => set("search_query", e.target.value)} />
      <p className="text-xs text-ink-3 md:col-span-2">帳號和關鍵字填一個就好：填帳號就會盯著那個帳號的新貼文，填關鍵字就會去找含這個關鍵字的貼文。</p>
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
      <input
        className={`${input} md:col-span-2`}
        type="number"
        min={1}
        title="每次抓幾篇"
        placeholder="每次抓幾篇（建議從小開始省 Apify 額度）"
        value={form.posts_limit}
        onChange={(e) => set("posts_limit", e.target.value)}
      />
      <p className="text-xs text-ink-3 md:col-span-2">
        抓取為手動觸發：新增後到上方按「立即抓取」即可產生素材。抓到的貼文只會生成「素材」，不會自動發文。
      </p>
      <div className="flex items-center gap-3 md:col-span-2">
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "新增中…" : "新增來源"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
