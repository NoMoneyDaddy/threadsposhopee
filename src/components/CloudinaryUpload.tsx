"use client";

import { useRef, useState } from "react";

// 本機選圖/影片 → 直接從瀏覽器上傳到使用者的 Cloudinary（unsigned preset）。
// 檔案完全不經過自家伺服器（不耗伺服器流量），只把回傳的 secure_url 交回表單。
export default function CloudinaryUpload({
  cloud,
  preset,
  onUploaded,
  onType
}: {
  cloud: string | null;
  preset: string | null;
  onUploaded: (url: string) => void;
  onType?: (t: "image" | "video") => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!cloud || !preset) {
    return (
      <a href="/accounts#setup-cloudinary" className="shrink-0 text-xs text-ink-3 underline hover:text-ink">
        綁定 Cloudinary 後可本機上傳
      </a>
    );
  }

  async function pick(file: File) {
    setErr(null);
    const isVideo = file.type.startsWith("video");
    const maxMB = isVideo ? 200 : 20;
    if (file.size > maxMB * 1024 * 1024) {
      setErr(`檔案過大（上限 ${maxMB}MB）`);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", preset!);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.secure_url) throw new Error(json?.error?.message || "上傳失敗");
      onType?.(json.resource_type === "video" ? "video" : "image");
      onUploaded(json.secure_url as string);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "上傳失敗");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "上傳中…" : "📷 本機上傳"}
      </button>
      {err && <span className="text-xs text-danger" role="alert">{err}</span>}
    </>
  );
}
