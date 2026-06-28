"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Material } from "@/lib/types";
import { cloudinaryThumb } from "@/lib/img";

// 爬蟲產出的「待審素材」逐筆審核：✅ 入庫（核准）或 ❌ 丟棄（刪除）。
// 入庫 → POST /api/materials/[id]/intake；丟棄 → DELETE /api/materials/[id]（沿用既有刪除）。
export default function PendingMaterialsReview({ items }: { items: Material[] }) {
  const router = useRouter();
  // 用 Set 追蹤每筆獨立的處理中狀態：避免快速連點多筆時，單一 busyId 互相覆蓋造成按鈕提早解禁（race）。
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // 成功處理過的 id：在 router.refresh() 帶回新資料前先本地隱藏，避免舊卡片仍可點而對同一筆重複送出。
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  async function act(id: string, kind: "approve" | "discard") {
    setBusyIds((prev) => new Set(prev).add(id));
    setErr(null);
    try {
      const res =
        kind === "approve"
          ? await fetch(`/api/materials/${id}/intake`, { method: "POST" })
          : await fetch(`/api/materials/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(typeof json?.error === "string" && json.error ? json.error : `操作失敗（HTTP ${res.status}）`);
      }
      setDoneIds((prev) => new Set(prev).add(id)); // 成功 → 立即隱藏該筆，刷新前不可再操作
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失敗");
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const visible = items.filter((m) => !doneIds.has(m.id));
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">🔎 待審素材</h2>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800">{visible.length}</span>
      </div>
      <p className="text-sm text-ink-2">爬蟲抓到的素材（已換好你的分潤連結＋AI 文案）。逐筆確認後才會入庫，入庫的才能排程發文。</p>
      <div className="space-y-3">
        {visible.map((m) => {
          const thumb = m.cloudinary_media_url || m.source_media_url || (m.media?.[0]?.url ?? null);
          const isVideo = m.media_type === "video" || m.media?.[0]?.type === "video";
          const busy = busyIds.has(m.id);
          return (
            <div key={m.id} className="flex gap-3 rounded-xl border bg-surface p-3">
              {thumb ? (
                isVideo ? (
                  // 行動端相容＋省流量：muted/playsInline 才能在 iOS 顯示首格；preload=metadata 不預載整片。
                  <video
                    src={thumb}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryThumb(thumb, 160)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-20 w-20 shrink-0 rounded-lg border object-cover"
                  />
                )
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border bg-surface-2 text-xs text-ink-3">無圖</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.product_name || `商品 ${m.item_id}`}</p>
                {m.affiliate_short_link && (
                  <a
                    href={m.affiliate_short_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-xs text-brand hover:underline"
                  >
                    {m.affiliate_short_link}
                  </a>
                )}
                {m.main_text && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-ink-2">{m.main_text}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => act(m.id, "approve")}
                    disabled={busy}
                    className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "處理中…" : "✅ 入庫"}
                  </button>
                  <button
                    type="button"
                    onClick={() => act(m.id, "discard")}
                    disabled={busy}
                    className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
                  >
                    ❌ 丟棄
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {err && <p className="text-xs text-danger" role="alert">{err}</p>}
    </section>
  );
}
