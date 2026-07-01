"use client";

import { useState } from "react";

// 設定「廣告跳轉頁」：訪客點你短連結的中轉頁「前往」時，於新分頁開啟此頁（可直接關），你用自己的廣告頁變現。
// 留空＝關閉（不開廣告，維持純中轉）。網址需為公開 http(s)，送出後由後端做 SSRF/協定驗證。
export default function RedirectAdForm({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/redirect/ad", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg({ tone: "err", text: data.error || "儲存失敗" });
      } else {
        setMsg({ tone: "ok", text: url.trim() ? "已儲存廣告跳轉頁" : "已關閉廣告跳轉頁" });
      }
    } catch {
      setMsg({ tone: "err", text: "網路錯誤，請稍後再試" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="section-title mb-1">廣告跳轉頁（選填）</h2>
      <p className="mb-3 text-sm text-ink-2">
        設定後，別人點開你的短連結、在預覽頁按「前往」時，會在<strong>新分頁</strong>開啟這個廣告頁（訪客可直接關閉），你能用自己的廣告頁變現。留空＝不開廣告。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://你的廣告頁.example.com/…"
          className="input min-w-0 flex-1"
          aria-label="廣告跳轉頁網址"
        />
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm shrink-0">
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className={"mt-2 text-xs " + (msg.tone === "ok" ? "text-green-600" : "text-red-600")}>{msg.text}</p>}
    </section>
  );
}
