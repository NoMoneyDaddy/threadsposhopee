"use client";

import { useEffect, useRef, useState } from "react";
import { checkUploadFile } from "@/lib/media-mime";

// 本機選圖/影片上傳，相容所有圖床：
// - 有綁 Cloudinary（cloud+preset）→ 直接從瀏覽器上傳到 Cloudinary（unsigned，不耗自家流量）。
// - 否則 → 走 /api/media/upload，由 server 用使用者綁的圖床（R2 或 Cloudinary）中轉。
// 兩條路都用標準 <input type="file" accept="image/*,video/*">，手機會開相簿／相機。
// 按鈕一律顯示（不再因未綁 Cloudinary 而隱藏）；未綁任何圖床時 server 會回明確錯誤導去綁定。
export default function MediaUpload({
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

  const clientCloudinary = Boolean(cloud && preset);

  async function uploadOne(file: File): Promise<{ url: string; type: "image" | "video" }> {
    // 型別白名單＋大小上限（與後端 /api/media/upload 共用 helper）：非圖片/影片直接拒絕、不臆測。
    const checked = checkUploadFile(file.type, file.size, file.name);
    if ("error" in checked) throw new Error(checked.error);
    if (clientCloudinary) {
      // 瀏覽器直傳 Cloudinary（unsigned preset）：檔案不經自家伺服器。
      // cloud 來自使用者自綁設定、非任意輸入，先 encodeURIComponent 防 path 注入。
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", preset!);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud!)}/auto/upload`, {
        method: "POST",
        body: fd
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.secure_url) throw new Error(json?.error?.message || `上傳失敗（HTTP ${res.status}）`);
      if (json.resource_type !== "image" && json.resource_type !== "video") throw new Error("僅支援圖片或影片檔案");
      return { url: json.secure_url as string, type: json.resource_type };
    }
    // 走 server：用使用者綁的圖床（R2 或 Cloudinary）中轉。
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/media/upload", { method: "POST", body: fd });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok || !json?.url) {
      throw new Error(typeof json?.error === "string" && json.error ? json.error : `上傳失敗（HTTP ${res.status}）`);
    }
    return { url: json.url as string, type: json.type === "video" ? "video" : "image" };
  }

  // 逐檔依序上傳：onUploaded 直接帶 type；單檔失敗只記錯不中斷其餘。先依 remaining 名額裁切。
  async function handleFiles(files: File[]) {
    setErr(null);
    const limit = multiple ? Math.max(0, remaining) : 1;
    const allowed = files.slice(0, limit);
    const errors: string[] = [];
    if (allowed.length < files.length) errors.push(`已達上限，僅上傳前 ${allowed.length} 個檔案`);
    // 名額用盡：仍要提示並清空 input（否則同一檔案無法再次觸發 change），不靜默返回。
    if (allowed.length === 0) {
      setErr(errors.length ? errors.join("；") : "已達媒體數量上限，未上傳檔案");
      if (ref.current) ref.current.value = "";
      return;
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
        aria-label="上傳圖片或影片檔案"
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
