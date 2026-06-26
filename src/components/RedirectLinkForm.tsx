"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 來源是否為蝦皮網址（含分潤短網域）→ 提示可一鍵套用預設分潤連結。
function isShopeeUrl(u: string): boolean {
  try {
    const host = new URL(u).host.toLowerCase().replace(/^www\./, "");
    return host === "shopee.tw" || host === "s.shopee.tw" || host === "shope.ee";
  } catch {
    return false;
  }
}

// 建立 go2read 短連結。送出後刷新列表並顯示產生的短連結。
export default function RedirectLinkForm({ defaultAffiliateUrl }: { defaultAffiliateUrl?: string | null }) {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const showShopeeHint = isShopeeUrl(sourceUrl) && !affiliateUrl.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setCreated(null);
    try {
      const res = await fetch("/api/redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, affiliateUrl, title })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "建立失敗");
      const base = process.env.NEXT_PUBLIC_SHORT_DOMAIN || location.origin;
      setCreated(`${base}/r/${json.code}`);
      setSourceUrl("");
      setAffiliateUrl("");
      setTitle("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card-p space-y-3">
      <div>
        <label className="label" htmlFor="rl-source">來源網址（必填）</label>
        <input id="rl-source" className="input" required value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://news.example.com/article" />
      </div>
      <div>
        <label className="label" htmlFor="rl-aff">分潤／導流連結（選填）</label>
        <input id="rl-aff" className="input" value={affiliateUrl} onChange={(e) => setAffiliateUrl(e.target.value)} placeholder="https://s.shopee.tw/..." />
        {showShopeeHint &&
          (defaultAffiliateUrl ? (
            <button
              type="button"
              onClick={() => setAffiliateUrl(defaultAffiliateUrl)}
              className="mt-1.5 rounded-lg border px-2.5 py-1 text-xs text-brand hover:bg-orange-50"
            >
              偵測到蝦皮連結 — 套用我的預設分潤連結
            </button>
          ) : (
            <p className="mt-1.5 text-xs text-ink-3">
              偵測到蝦皮連結。可到 <a href="/accounts#setup-shopee" className="text-brand underline">帳號管理</a> 設定預設分潤連結，之後一鍵套用。
            </p>
          ))}
      </div>
      <div>
        <label className="label" htmlFor="rl-title">標題（選填，中轉頁/分享預覽用）</label>
        <input id="rl-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：今日科技要聞" />
      </div>
      <button type="submit" disabled={busy} className="btn btn-brand">
        {busy ? "建立中…" : "建立短連結"}
      </button>
      {created && (
        <p className="rounded-xl bg-success/10 p-2 text-sm text-success">
          已建立：<a href={created} className="font-medium underline" target="_blank" rel="noopener">{created}</a>
        </p>
      )}
      {msg && <p className="text-sm text-red-500">❌ {msg}</p>}
    </form>
  );
}
