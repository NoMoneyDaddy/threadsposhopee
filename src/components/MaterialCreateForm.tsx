"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CloudinaryUpload from "@/components/CloudinaryUpload";

// 手動建立素材：貼蝦皮商品連結（必填）＋可選自帶媒體（圖／影片網址或本機上傳）。
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
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
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
          media_url: mediaUrl.trim() || null,
          media_type: mediaUrl.trim() ? mediaType : null
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUrl("");
      setMediaUrl("");
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
        <label className="mb-1 block text-xs text-ink-2">媒體（選填，自帶圖／影片；留空則用商品圖）</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={input + " flex-1"}
            placeholder="圖片／影片網址"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            inputMode="url"
            aria-label="媒體網址"
          />
          <select
            className="rounded-xl border px-2 py-2 text-sm"
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as "image" | "video")}
            aria-label="媒體類型"
          >
            <option value="image">圖片</option>
            <option value="video">影片</option>
          </select>
          <CloudinaryUpload
            cloud={cloud}
            preset={preset}
            onUploaded={(u, t) => {
              setMediaUrl(u);
              setMediaType(t);
            }}
          />
        </div>
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
