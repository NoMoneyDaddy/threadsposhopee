"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";

// 預設分潤連結：AI 部落客走 go2read 中轉時，「繼續」會去的分潤連結。一次設定、套用所有部落客貼文。
export default function DefaultAffiliateForm({ initial, suggested }: { initial: string | null; suggested: string }) {
  const router = useRouter();
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(next?: string) {
    const value = next ?? url;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout(
        "/api/accounts/default-affiliate",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: value }) },
        10000
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      // 後端可能已把一般連結轉成分潤連結，回填最終值。
      setUrl(json.url ?? "");
      setMsg(
        !json.url
          ? "✅ 已清除"
          : json.converted
            ? "✅ 已存（已自動轉為你的分潤連結）"
            : json.note
              ? `✅ 已存（${json.note}）`
              : "✅ 已存（原本就是分潤連結）"
      );
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">AI 部落客預設分潤連結</div>
      <p className="mb-2 text-xs text-ink-2">
        AI 部落客發文若開啟 go2read 中轉，訪客按「繼續」會前往這個分潤連結（一次設定、不必每篇重設）。
        貼一般蝦皮商品／商城連結即可，<b>存檔時會自動用你的蝦皮金鑰轉成分潤連結</b>（已是分潤連結則不重複轉）。
        留空＝中轉頁只導向新聞來源、不附分潤。需先到帳號管理綁定蝦皮金鑰或 affiliate_id 才能轉分潤。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          className="input min-w-0 flex-1"
          aria-label="預設分潤連結"
          placeholder={suggested}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={busy} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => save(suggested)}
        disabled={busy}
        className="mt-2 text-xs text-brand underline"
      >
        套用建議：蝦皮直營商城（{suggested}）
      </button>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
