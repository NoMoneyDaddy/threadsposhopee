"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftMedia } from "@/lib/types";
import MediaPicker from "@/components/MediaPicker";

// 手動建立素材：貼蝦皮商品連結（必填）＋可選自帶媒體（同一篇可多張圖／影片，本機多選或貼網址）。
export default function MaterialCreateForm({
  cloud = null,
  preset = null
}: {
  cloud?: string | null;
  preset?: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [withCopy, setWithCopy] = useState(true);
  const [media, setMedia] = useState<DraftMedia[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // 客端先擋明顯非蝦皮連結，省一次往返、也讓錯誤即時（後端仍會再驗）。
    const trimmed = url.trim();
    let okHost = false;
    try {
      const h = new URL(trimmed).hostname.toLowerCase();
      okHost = h === "shope.ee" || h === "shp.ee" || /(^|\.)shopee\./.test(h);
    } catch {
      okHost = false;
    }
    if (!okHost) {
      setMsg("❌ 請貼有效的蝦皮商品連結（shopee.tw / s.shopee.tw / shope.ee / shp.ee）");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopee_url: trimmed,
          generate_copy: withCopy,
          media
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUrl("");
      setMedia([]);
      setMsg(json.reused ? "✅ 這個商品已經有素材了，直接帶出來給你，不會重複生成" : "✅ 素材建好了，也幫你換上分潤連結");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border bg-surface p-4">
      <h3 className="font-medium">手動建立素材</h3>
      <div>
        <label htmlFor="material-url" className="mb-1 block text-xs text-ink-2">蝦皮商品連結（必填）</label>
        <input
          id="material-url"
          className={input}
          type="url"
          placeholder="蝦皮連結（s.shopee.tw/... 或 shopee.tw/product/...）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-2">圖片或影片（一篇可以放好幾張，建議自己上傳；留空的話這份素材就沒有圖）</label>
        <MediaPicker items={media} onChange={setMedia} cloud={cloud} preset={preset} hint="可以加多張照片或影片，放多張會變成輪播" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} />
        順便用 AI 幫我寫文案（不勾的話只先建好分潤連結，文案晚點再補）
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "建立中…" : "建立素材"}
        </button>
        {msg && (
          <span
            className={"text-sm " + (msg.startsWith("❌") ? "text-red-600" : "text-emerald-600")}
            role={msg.startsWith("❌") ? "alert" : "status"}
            aria-live="polite"
          >
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
