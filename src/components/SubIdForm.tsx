"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 自訂分潤 subId：套用到「API 轉換短連結」與「an_redir 長連結」兩種分潤連結（蝦皮報表依此分流）。
export default function SubIdForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [subId, setSubId] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/accounts/shopee-sub-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sub_id: subId })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSubId(json.subId ?? "");
      setMsg(json.subId ? "✅ 已儲存" : "✅ 已清除");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">蝦皮分潤連結自訂來源標記 Sub id（選填）</div>
      <p className="mb-2 text-xs text-ink-2">
        會加在你的分潤連結上，出現在蝦皮分潤報表，方便分辨哪個帳號／活動帶來成交。
        留空＝用預設。<b>僅能含英數與底線</b>、長度上限 50（依蝦皮規範）。
        共 5 個變數可自行排列組合：<code className="font-mono">{"{date}"}</code>（發文日期）、
        <code className="font-mono">{"{time}"}</code>（發文時間）、<code className="font-mono">{"{platform}"}</code>（平台）、
        <code className="font-mono">{"{account}"}</code>（帳號）、<code className="font-mono">{"{item}"}</code>（商品編號）。
      </p>
      <div className="mb-1 text-xs text-ink-3">點變數附加至尾端，或點下方範本：</div>
      <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
        {["{date}", "{time}", "{platform}", "{account}", "{item}"].map((tok) => (
          <button
            key={tok}
            type="button"
            onClick={() => setSubId((s) => (s + tok).slice(0, 50))}
            className="rounded-lg border border-brand/40 px-2 py-1 font-mono text-brand hover:bg-orange-50"
          >
            {tok}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5 text-xs">
        {["{platform}_{date}", "{account}_{date}", "{account}_{item}", "{date}_{time}"].map((tpl) => (
          <button
            key={tpl}
            type="button"
            onClick={() => setSubId(tpl)}
            className="rounded-lg border px-2 py-1 font-mono hover:bg-surface-2"
          >
            {tpl}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          aria-label="自訂分潤 subId"
          placeholder="例如 myshop_{date}"
          value={subId}
          onChange={(e) => setSubId(e.target.value)}
          maxLength={50}
        />
        <button onClick={save} disabled={busy} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2">{msg}</p>}
    </div>
  );
}
