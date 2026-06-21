"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ThreadsAccount } from "@/lib/types";

// 批次貼連結：一次多個蝦皮連結 → 各自產生素材＋文案 → 全部加入佇列或存草稿。
export default function BatchCompose({ threadsAccounts }: { threadsAccounts: ThreadsAccount[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(threadsAccounts[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [results, setResults] = useState<{ url: string; ok: boolean; error?: string; scheduledAt?: string }[]>([]);

  const urls = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function run(action: "queue" | "draft") {
    if (urls.length === 0) {
      setMsg("請每行貼一個蝦皮連結");
      return;
    }
    const targetAccountId = accountId || threadsAccounts[0]?.id;
    if (action === "queue" && !targetAccountId) {
      setMsg("加入佇列需先選發文帳號");
      return;
    }
    setBusy(action);
    setMsg(null);
    setResults([]);
    try {
      const res = await fetch("/api/compose/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls, threads_account_id: targetAccountId, action })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setResults(json.results ?? []);
      setMsg(`✅ 完成 ${json.done}/${json.total}（${action === "queue" ? "已加入佇列" : "已存草稿"}）`);
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-surface p-4">
      <div>
        <label className="mb-1 block text-sm font-medium">批次貼連結（每行一個，最多 20）</label>
        <textarea
          className="w-full rounded-xl border px-3 py-2 text-sm"
          rows={5}
          placeholder={"https://s.shopee.tw/aaa\nhttps://s.shopee.tw/bbb\nhttps://s.shopee.tw/ccc"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 text-xs text-ink-3">{urls.length} 個連結</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="發文帳號" className="rounded-xl border px-2 py-2 text-sm" value={accountId || threadsAccounts[0]?.id || ""} onChange={(e) => setAccountId(e.target.value)}>
          {threadsAccounts.length === 0 && <option value="">（尚無發文帳號）</option>}
          {threadsAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => run("queue")}
          disabled={!!busy || urls.length === 0}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "queue" ? "處理中…" : "全部加入佇列"}
        </button>
        <button
          onClick={() => run("draft")}
          disabled={!!busy || urls.length === 0}
          className="rounded-xl border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          {busy === "draft" ? "處理中…" : "全部存草稿"}
        </button>
      </div>

      {msg && <p className="text-sm text-ink-2">{msg}</p>}
      {results.length > 0 && (
        <ul className="space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-green-600" : "text-red-500"}>
              {r.ok ? "✅" : "❌"} <span className="text-ink-2">{r.url}</span>
              {r.scheduledAt && ` → ${new Date(r.scheduledAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short" })}`}
              {r.error && ` — ${r.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
