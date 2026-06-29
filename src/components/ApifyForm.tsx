"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BoundKeyHint from "@/components/BoundKeyHint";

// 抓取子系統：綁定自己的 Apify API token（任何使用者皆可綁自己的）。token 不回傳明文。
// actor 固定為系統內建（threads-search-scraper），不開放自訂。
export default function ApifyForm({ bound }: { bound: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!token.trim()) {
      setMsg("請貼上 Apify token");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/apify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg("✅ 已綁定");
      setToken("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const input = "input";
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">抓文生素材（Apify）綁定</span>
        {bound ? <span className="badge-success">已綁定</span> : <span className="badge-neutral">未綁定</span>}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        監看來源的抓取用你自己的 Apify 帳號。取得 API token：登入{" "}
        <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener" className="text-brand underline">
          Apify → Settings → Integrations
        </a>
        ，複製 Personal API token 貼到下方即可。
      </p>
      <p className="mb-2 text-xs text-ink-3">
        費用算在你的 Apify 帳號：免費帳號每月約 US$5 平台額度。系統固定使用內建抓取器
        （threads-search-scraper），計費約 US$5 / 每 1,000 筆結果起（實際以 Apify 商店頁為準）。
        建議把來源的「每次抓取篇數」設小一點省額度。
      </p>
      {bound && <BoundKeyHint label="目前已綁定 Apify token" />}
      <div className="space-y-2">
        <input
          className={input}
          type="password"
          placeholder={bound ? "貼上新的 Apify token 以更新" : "Apify API token"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button onClick={save} disabled={busy} className="btn btn-brand">
          {busy ? "儲存中…" : bound ? "更新綁定" : "綁定"}
        </button>
        {msg && <p className="text-sm text-ink-2">{msg}</p>}
      </div>
    </div>
  );
}
