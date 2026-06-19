"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";

// 各人自綁 Cloudinary：素材（圖片/影片）中轉進你自己的雲端，而非共用 owner 的額度。
// 只需 cloud name 與一個「unsigned」upload preset（preset 本就設計給前端公開使用，非機密）。
export default function CloudinaryForm({
  initialCloud,
  initialPreset
}: {
  initialCloud: string | null;
  initialPreset: string | null;
}) {
  const router = useRouter();
  const [cloud, setCloud] = useState(initialCloud ?? "");
  const [preset, setPreset] = useState(initialPreset ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout(
        "/api/accounts/cloudinary",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cloud: cloud.trim(), preset: preset.trim() })
        },
        10000
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(cloud.trim() ? "✅ 已儲存" : "✅ 已清除");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-1 font-medium">媒體雲端（Cloudinary，選填）</div>
      <p className="mb-2 text-xs text-neutral-500">
        綁你自己的 Cloudinary，素材就中轉進你的雲端（不佔共用額度）。到 Cloudinary 後台建一個 <b>unsigned</b> upload
        preset，cloud name 與 preset <b>兩者都要填</b>；全部留空則用系統共用設定。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          aria-label="Cloudinary cloud name"
          placeholder="cloud name（如 my-cloud）"
          value={cloud}
          onChange={(e) => setCloud(e.target.value)}
        />
        <input
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          aria-label="Cloudinary unsigned upload preset"
          placeholder="upload preset（unsigned）"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        />
        <button
          onClick={save}
          disabled={busy}
          className="shrink-0 rounded-md bg-shopee px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-neutral-600" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
