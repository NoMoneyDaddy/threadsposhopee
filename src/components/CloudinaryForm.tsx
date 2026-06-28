"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";
import BoundKeyHint from "@/components/BoundKeyHint";

// 各人自綁 Cloudinary：素材（圖片/影片）中轉進你自己的雲端，而非共用 owner 的額度。
// 只需 cloud name 與一個「unsigned」upload preset（preset 本就設計給前端公開使用，非機密）。
export default function CloudinaryForm({
  initialCloud,
  initialPreset,
  hasApiKey
}: {
  initialCloud: string | null;
  initialPreset: string | null;
  hasApiKey?: boolean;
}) {
  const router = useRouter();
  const [cloud, setCloud] = useState(initialCloud ?? "");
  const [preset, setPreset] = useState(initialPreset ?? "");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
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
          body: JSON.stringify({
            cloud: cloud.trim(),
            preset: preset.trim(),
            apiKey: apiKey.trim(),
            apiSecret: apiSecret.trim()
          })
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
    <div className="card p-4">
      <div className="mb-1 font-medium">圖片／影片存放（Cloudinary）</div>
      <p className="mb-2 text-xs text-ink-2">
        綁你自己的 Cloudinary，素材／本機上傳都進你自己的雲端。到 Cloudinary 後台建一個 <b>unsigned</b> upload
        preset，cloud name 與 preset <b>兩者都要填</b>。<b>本服務不提供共用後備</b>——未綁定則媒體不中轉（發文沿用原始連結），且無法使用本機上傳。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          aria-label="Cloudinary cloud name"
          placeholder="cloud name（如 my-cloud）"
          value={cloud}
          onChange={(e) => setCloud(e.target.value)}
        />
        <input
          className="input min-w-0 flex-1"
          aria-label="Cloudinary unsigned upload preset"
          placeholder="upload preset（unsigned）"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
        />
        <button onClick={save} disabled={busy} className="btn btn-brand shrink-0">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      <p className="mb-1 mt-3 text-xs text-ink-2">
        （選填）想在儀表板看「用量」就再填 Cloudinary 後台的 <b>API Key</b> 與 <b>API Secret</b>
        （Dashboard → Account Details）。不填也能正常上傳，只是看不到用量。
      </p>
      {hasApiKey && <BoundKeyHint label="目前已綁定 API Key／Secret" />}
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          type="password"
          aria-label="Cloudinary API Key"
          placeholder={hasApiKey ? "API Key（留空＝不變更）" : "API Key（選填）"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <input
          className="input min-w-0 flex-1"
          type="password"
          aria-label="Cloudinary API Secret"
          placeholder={hasApiKey ? "API Secret（留空＝不變更）" : "API Secret（選填）"}
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
        />
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
