"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 建立 go2read 短連結。送出後刷新列表並顯示產生的短連結。
export default function RedirectLinkForm() {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState("");
  // 永遠保有最新來源網址（closure 會凍結 state，故用 ref 在非同步回應落地時比對是否仍為同一網址）。
  const sourceUrlRef = useRef("");
  const [title, setTitle] = useState("");
  const [titleAuto, setTitleAuto] = useState(false); // 標題是否為自動抓來的（使用者一動就不再覆寫）
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // 失焦時抓來源頁面標題自動帶入（標題仍為空、或先前是自動帶入的才覆寫）。best-effort，不擋手動輸入。
  async function autofillTitle() {
    const u = sourceUrl.trim();
    if (!u || (title.trim() && !titleAuto)) return;
    setFetchingTitle(true);
    try {
      const res = await fetch(`/api/redirect/preview?url=${encodeURIComponent(u)}`);
      const json = await res.json();
      // 抓取期間使用者已改網址 → 丟棄過時結果，避免舊回應覆寫新標題。
      if (json.ok && json.title && sourceUrlRef.current.trim() === u) {
        setTitle(json.title);
        setTitleAuto(true);
      }
    } catch {
      /* best-effort，抓不到就維持使用者可手動填 */
    } finally {
      setFetchingTitle(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setCreated(null);
    try {
      const res = await fetch("/api/redirect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl, title })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "建立失敗");
      const base = process.env.NEXT_PUBLIC_SHORT_DOMAIN || location.origin;
      setCreated(`${base}/r/${json.code}`);
      setSourceUrl("");
      sourceUrlRef.current = "";
      setTitle("");
      setTitleAuto(false);
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
        <input
          id="rl-source"
          className="input"
          required
          value={sourceUrl}
          onChange={(e) => {
            sourceUrlRef.current = e.target.value;
            setSourceUrl(e.target.value);
          }}
          onBlur={autofillTitle}
          placeholder="https://news.example.com/article"
        />
      </div>
      <div>
        <label className="label" htmlFor="rl-title">
          標題（選填，中轉頁/分享預覽用）
          {fetchingTitle && <span className="ml-2 text-xs text-ink-3">抓取來源標題中…</span>}
        </label>
        <input
          id="rl-title"
          className="input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleAuto(false);
          }}
          placeholder="留空＝自動抓來源頁面標題"
        />
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
