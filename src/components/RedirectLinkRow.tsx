"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BioToggle from "@/components/BioToggle";
import CopyLink from "@/components/CopyLink";

export interface RedirectLinkView {
  code: string;
  sourceUrl: string;
  affiliateUrl: string | null;
  title: string | null;
  clicks: number;
  continues: number;
  inBio: boolean;
}

// 單筆短連結列：顯示／編輯（目的地/分潤/標題，短碼不變）／刪除。
export default function RedirectLinkRow({ link }: { link: RedirectLinkView }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState(link.sourceUrl);
  const [affiliateUrl, setAffiliateUrl] = useState(link.affiliateUrl ?? "");
  const [title, setTitle] = useState(link.title ?? "");

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch(`/api/redirect/${link.code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, affiliateUrl, title })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "更新失敗");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm("確定刪除這個短連結？已分享出去的連結將失效，此動作無法復原。")) return;
    setBusy("delete");
    setMsg(null);
    try {
      const res = await fetch(`/api/redirect/${link.code}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "刪除失敗");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  // 進/退編輯都把表單同步成最新的 link props：避免 router.refresh() 後本地 state 仍是舊快取。
  function syncFromProps() {
    setSourceUrl(link.sourceUrl);
    setAffiliateUrl(link.affiliateUrl ?? "");
    setTitle(link.title ?? "");
    setMsg(null);
  }
  function startEdit() {
    syncFromProps();
    setEditing(true);
  }
  function cancel() {
    syncFromProps();
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="space-y-2 py-3">
        <div>
          <label className="label" htmlFor={`rl-src-${link.code}`}>來源網址（必填）</label>
          <input id={`rl-src-${link.code}`} className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor={`rl-aff-${link.code}`}>分潤／導流連結（選填）</label>
          <input id={`rl-aff-${link.code}`} className="input" value={affiliateUrl} onChange={(e) => setAffiliateUrl(e.target.value)} placeholder="https://s.shopee.tw/..." />
        </div>
        <div>
          <label className="label" htmlFor={`rl-ttl-${link.code}`}>標題（選填）</label>
          <input id={`rl-ttl-${link.code}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy === "save" || !sourceUrl.trim()} className="btn btn-brand btn-sm">
            {busy === "save" ? "儲存中…" : "儲存"}
          </button>
          <button onClick={cancel} disabled={!!busy} className="btn btn-outline btn-sm">取消</button>
        </div>
        {msg && <p className="text-sm text-red-500">❌ {msg}</p>}
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{link.title ?? link.sourceUrl}</div>
        <div className="truncate text-xs text-ink-3">{link.sourceUrl}</div>
        {msg && <p className="text-xs text-red-500">❌ {msg}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-ink-2 tabular-nums">👁 {link.clicks} · ▶ {link.continues}</span>
        <BioToggle code={link.code} initial={link.inBio} />
        <CopyLink path={`/r/${link.code}`} />
        <button onClick={startEdit} disabled={!!busy} className="text-xs text-ink-2 hover:underline disabled:opacity-50">
          編輯
        </button>
        <button onClick={remove} disabled={!!busy} className="text-xs text-red-500 hover:underline disabled:opacity-50">
          {busy === "delete" ? "刪除中…" : "刪除"}
        </button>
      </div>
    </li>
  );
}
