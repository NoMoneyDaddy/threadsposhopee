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
      <div className="font-medium">連結 Threads 發文帳號</div>
      <p className="text-xs text-ink-2">
        貼上 access token 即可綁定：系統會自動取回帳號 id／暱稱、（附 App 密鑰時）把短效權杖換成 60 天長效，並每日自動展期。
      </p>
      <details className="rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
        <summary className="cursor-pointer font-medium text-ink-1">如何取得 access token？</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            到{" "}
            <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener" className="text-brand underline">
              developers.facebook.com
            </a>{" "}
            建立 App，用途選「<b>Access the Threads API</b>」。
          </li>
          <li>
            加入 <b>Threads</b> 使用案例，權限至少勾 <code>threads_basic</code>、<code>threads_content_publish</code>
            （要成效／留言／選題再加 <code>threads_manage_insights</code>、<code>threads_read_replies</code>、
            <code>threads_manage_replies</code>、<code>threads_keyword_search</code>）。
          </li>
          <li>
            到 <b>Threads 使用案例 → 設定</b>，把要發文的帳號加進去，按 <b>產生存取權杖（Generate access token）</b> 複製 token。
          </li>
          <li>貼到下方欄位。後台產生的權杖本即 60 天長效；若用 1 小時短效權杖，另填 App 密鑰（App 設定 → 基本）換長效。</li>
        </ol>
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
          📱 手機操作提醒：在手機上產生權杖時，請用瀏覽器的「電腦版網站（桌面版）」模式，並先暫時移除（解除安裝）Threads App，授權跳轉才會正確；完成後再裝回。
        </p>
        <a href="/guide#threads" className="mt-2 inline-block text-brand underline">
          完整教學 →
        </a>
      </details>
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
