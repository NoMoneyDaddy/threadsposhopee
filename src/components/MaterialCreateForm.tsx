"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MaterialCreateForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [withCopy, setWithCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopee_url: url, generate_copy: withCopy })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUrl("");
      setMsg(json.reused ? "✅ 已有素材，直接帶出（未重燒 token）" : "✅ 已建立素材＋分潤連結");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border bg-white p-4">
      <div className="font-medium">手動建立素材（貼蝦皮商品連結）</div>
      <input
        className="w-full rounded-md border px-3 py-2 text-sm"
        placeholder="蝦皮連結（s.shopee.tw/... 或 shopee.tw/product/...）"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <label className="flex items-center gap-2 text-sm text-neutral-600">
        <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} />
        順便用 AI 生成文案（不勾＝只建分潤連結，文案之後再補）
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-md bg-shopee px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "建立中…" : "建立素材"}
        </button>
        {msg && <span className="text-sm text-neutral-600">{msg}</span>}
      </div>
    </form>
  );
}
