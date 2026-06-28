"use client";

import { useEffect, useRef, useState } from "react";

// 本機選圖/影片 → 直接從瀏覽器上傳到使用者的 Cloudinary（unsigned preset）。
// 檔案完全不經過自家伺服器（不耗伺服器流量），只把回傳的 secure_url 與型別交回表單。
// multiple=true 時可一次從相簿多選，逐檔依序上傳；onUploaded 直接帶 type，呼叫端免暫存。
export default function CloudinaryUpload({
  cloud,
  preset,
  onUploaded,
  multiple = false,
  disabled = false,
  remaining = Infinity
}: {
  cloud: string | null;
  preset: string | null;
  onUploaded: (url: string, type: "image" | "video") => void;
  multiple?: boolean;
  disabled?: boolean;
  remaining?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!cloud || !preset) {
    return (
      <a href="/accounts#setup-cloudinary" className="shrink-0 text-xs text-ink-3 underline hover:text-ink">
        綁定 Cloudinary 後可本機上傳
      </a>
    );
  }

  async function uploadOne(file: File): Promise<{ url: string; type: "image" | "video" }> {
    const isVideo = file.type.startsWith("video");
    const maxMB = isVideo ? 200 : 20;
    if (file.size > maxMB * 1024 * 1024) {
      throw new Error(`「${file.name}」過大（上限 ${maxMB}MB）`);
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", preset!);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json.secure_url) throw new Error(json?.error?.message || "上傳失敗");
    return { url: json.secure_url as string, type: json.resource_type === "video" ? "video" : "image" };
  }

  // 逐檔依序上傳：onUploaded 直接帶 type（不依賴外部暫存，免並發競態）；單檔失敗只記錯不中斷其餘。
  // 先依 remaining 名額裁切，避免超過上限的多餘檔案被白上傳浪費額度。
  // 卸載後停止後續上傳並略過 setState（多檔路徑較長，使用者可能中途離開）。
  async function handleFiles(files: File[]) {
    setErr(null);
    const limit = multiple ? Math.max(0, remaining) : 1;
    const allowed = files.slice(0, limit);
    if (allowed.length === 0) return;
    // 各檔錯誤彙整後一次呈現（避免多檔失敗時只看到最後一筆）。
    const errors: string[] = [];
    if (allowed.length < files.length) {
      errors.push(`已達上限，僅上傳前 ${allowed.length} 個檔案`);
    }
    setBusy(true);
    try {
      for (const f of allowed) {
        if (!mounted.current) break;
        try {
          const r = await uploadOne(f);
          if (!mounted.current) break;
          onUploaded(r.url, r.type);
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "上傳失敗");
        }
      }
    } finally {
      if (mounted.current) {
        setErr(errors.length ? errors.join("；") : null);
        setBusy(false);
      }
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,video/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleFiles(files);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy || disabled}
        className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "上傳中…" : multiple ? "📷 本機上傳（可多選）" : "📷 本機上傳"}
      </button>
      {err && <span className="text-xs text-danger" role="alert">{err}</span>}
    </>
  );
}
