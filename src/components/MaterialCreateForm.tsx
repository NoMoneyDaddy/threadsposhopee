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
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopee_url: url,
          generate_copy: withCopy,
          media
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUrl("");
      setMedia([]);
      setMsg(json.reused ? "✅ 已有素材，直接帶出（未重燒 token）" : "✅ 已建立素材＋分潤連結");
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
      <div className="font-medium">手動建立素材</div>
      <div>
        <label className="mb-1 block text-xs text-ink-2">蝦皮商品連結（必填）</label>
        <input
          className={input}
          placeholder="蝦皮連結（s.shopee.tw/... 或 shopee.tw/product/...）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-ink-2">媒體（同一篇可多張圖／影片；建議自行上傳，留空則該素材無圖）</label>
        <MediaPicker items={media} onChange={setMedia} cloud={cloud} preset={preset} hint="可加多張照片／影片（多張＝輪播）" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={withCopy} onChange={(e) => setWithCopy(e.target.checked)} />
        順便用 AI 生成文案（不勾＝只建分潤連結，文案之後再補）
      </label>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "建立中…" : "建立素材"}
        </button>
        {msg && <span className="text-sm text-ink-2">{msg}</span>}
      </div>
    </form>
  );
}
