"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cloudinaryThumb, videoFirstFrameSrc } from "@/lib/img";

// 連結失效時的修正面板：顯示商品名＋媒體大圖（可放大全螢幕以圖找商品），
// 讓使用者貼「新的原始商品連結」重產分潤連結，或直接手動覆寫分潤連結。
export default function MaterialLinkFixer({
  materialId,
  productName,
  mediaUrl,
  mediaType
}: {
  materialId: string;
  productName: string | null;
  mediaUrl: string | null;
  mediaType: "image" | "video" | "none" | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false); // 媒體全螢幕
  const [productUrl, setProductUrl] = useState("");
  const [affiliate, setAffiliate] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const hasMedia = Boolean(mediaUrl) && mediaType !== "none";

  async function submit() {
    if (!productUrl.trim() && !affiliate.trim()) {
      setMsg("❌ 請貼新的商品連結，或在進階手動填分潤連結");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/update-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_url: productUrl.trim() || undefined, affiliate_link: affiliate.trim() || undefined })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" ? json.error : `更新失敗（HTTP ${res.status}）`);
      setMsg(json.regenerated ? "✅ 已更新商品連結並重產分潤連結" : "✅ 已更新分潤連結");
      setProductUrl("");
      setAffiliate("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-warn/50 px-3 py-1 text-xs font-medium text-warn hover:bg-amber-50"
      >
        🔧 更新連結
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-warn/40 bg-amber-50/40 p-3">
      <div className="text-xs font-medium text-ink">🔧 修正失效連結</div>
      <p className="break-words text-xs text-ink-2">
        商品：<b>{productName || "（未命名商品）"}</b>。用下方大圖比對，到蝦皮找到同一商品，貼上新的商品連結即可重產分潤連結。
      </p>
      {hasMedia && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block w-full overflow-hidden rounded-lg border"
          title="點擊放大（全螢幕）以圖找商品"
        >
          {mediaType === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={videoFirstFrameSrc(mediaUrl!)} muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1} className="h-40 w-full object-contain bg-black/5" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cloudinaryThumb(mediaUrl!, 800)} alt={productName ?? "商品圖"} loading="lazy" referrerPolicy="no-referrer" className="h-40 w-full object-contain bg-black/5" />
          )}
          <span className="block bg-surface-2 py-0.5 text-center text-[11px] text-ink-3">🔍 點擊放大全螢幕</span>
        </button>
      )}
      <input
        className="input text-sm"
        placeholder="貼上新的蝦皮商品連結"
        value={productUrl}
        onChange={(e) => setProductUrl(e.target.value)}
        aria-label="新的原始商品連結"
      />
      <button type="button" onClick={() => setAdvanced((v) => !v)} className="text-xs text-brand hover:underline">
        {advanced ? "▾ 收起進階" : "▸ 進階：手動填分潤連結"}
      </button>
      {advanced && (
        <input
          className="input text-sm"
          placeholder="直接貼可用的分潤短連結（會略過重產）"
          value={affiliate}
          onChange={(e) => setAffiliate(e.target.value)}
          aria-label="手動分潤連結"
        />
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {busy ? "更新中…" : "更新連結"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface">
          取消
        </button>
        {msg && <span className={"text-xs " + (msg.startsWith("❌") ? "text-red-600" : "text-ink-2")} role="status" aria-live="polite">{msg}</span>}
      </div>

      {/* 全螢幕大圖：以圖找商品 */}
      {zoom && hasMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label="商品媒體放大檢視"
        >
          {mediaType === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={mediaUrl!} controls playsInline className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cloudinaryThumb(mediaUrl!, 1600)} alt={productName ?? "商品圖"} referrerPolicy="no-referrer" className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <button type="button" onClick={() => setZoom(false)} className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-ink" aria-label="關閉放大檢視">
            ✕ 關閉
          </button>
        </div>
      )}
    </div>
  );
}
