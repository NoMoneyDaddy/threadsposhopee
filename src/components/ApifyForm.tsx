"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import BoundKeyHint from "@/components/BoundKeyHint";
import { THREADS_ACTORS, THREADS_ACTOR_OPTIONS } from "@/lib/apify-actors";

// 抓取子系統：綁定自己的 Apify API token（任何使用者皆可綁自己的）。token 不回傳明文。
// 已綁定後可在新／舊兩個抓取器（actor）間自由切換（只改 actor、不用重貼 token）。
export default function ApifyForm({ bound, actor }: { bound: boolean; actor?: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 目前生效的 actor（未設＝預設新版）。
  const [actorSel, setActorSel] = useState(actor || THREADS_ACTORS.default);
  const [actorBusy, setActorBusy] = useState(false);
  const [actorMsg, setActorMsg] = useState<string | null>(null);

  async function saveActor(next: string) {
    setActorSel(next);
    setActorBusy(true);
    setActorMsg(null);
    try {
      const res = await fetch("/api/accounts/apify/actor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: next })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setActorMsg("✅ 已切換抓取器");
      router.refresh();
    } catch (e) {
      setActorMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActorBusy(false);
    }
  }

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

      {bound && (
        <div className="mt-4 border-t pt-3">
          <label className="mb-1 block text-sm font-medium">抓取器（actor）</label>
          <select
            className="input"
            value={actorSel}
            disabled={actorBusy}
            onChange={(e) => saveActor(e.target.value)}
          >
            {THREADS_ACTOR_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-3">{THREADS_ACTOR_OPTIONS.find((o) => o.id === actorSel)?.note}</p>
          <p className="mt-1 text-xs text-ink-3">切換立即生效（沿用現有 token）。「日期區間／排序／帳號內關鍵字」只有舊版 igview 會吃。</p>
          {actorMsg && <p className="mt-1 text-sm text-ink-2">{actorMsg}</p>}
        </div>
      )}
    </div>
  );
}
