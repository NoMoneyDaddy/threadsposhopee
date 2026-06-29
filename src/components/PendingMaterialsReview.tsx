"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Material, DraftMedia } from "@/lib/types";
import { cloudinaryThumb } from "@/lib/img";
import { normalizeDraftMedia } from "@/lib/media";

const SLOT_OPTS: { v: NonNullable<DraftMedia["slot"]>; label: string }[] = [
  { v: "main", label: "主文" },
  { v: "reply", label: "留言" },
  { v: "both", label: "都用" }
];

// 單張媒體預覽：scraper 來源常是 Threads/IG CDN（防盜連），一律帶 referrerPolicy=no-referrer 才載得到。
function MediaThumb({ m }: { m: DraftMedia }) {
  if (m.type === "video") {
    return (
      <video
        src={m.url}
        controls
        muted
        playsInline
        preload="metadata"
        className="h-24 w-24 rounded-lg border object-cover"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cloudinaryThumb(m.url, 240)}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="h-24 w-24 rounded-lg border object-cover"
    />
  );
}

// 單筆待審素材卡：預覽全部媒體＋逐張標記用途（主文／留言／都用，即時保存），再決定入庫／丟棄。
function PendingMaterialCard({
  m,
  busy,
  onAct
}: {
  m: Material;
  busy: boolean;
  onAct: (id: string, kind: "approve" | "discard") => void;
}) {
  const [media, setMedia] = useState<DraftMedia[]>(() => normalizeDraftMedia(m).map((x) => ({ ...x, slot: x.slot ?? "main" })));
  const [slotErr, setSlotErr] = useState<string | null>(null);

  async function setSlot(idx: number, slot: DraftMedia["slot"]) {
    const prev = media;
    const next = media.map((x, i) => (i === idx ? { ...x, slot } : x));
    setMedia(next);
    setSlotErr(null);
    try {
      const res = await fetch(`/api/materials/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media: next })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" ? json.error : `儲存失敗（HTTP ${res.status}）`);
    } catch (e) {
      setMedia(prev); // 失敗回復，避免畫面與 DB 不一致
      setSlotErr(e instanceof Error ? e.message : "媒體用途儲存失敗");
    }
  }

  return (
    <div className="rounded-xl border bg-surface p-3">
      <p className="truncate font-medium">{m.product_name || `商品 ${m.item_id}`}</p>
      {m.affiliate_short_link && (
        <a href={m.affiliate_short_link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">
          {m.affiliate_short_link}
        </a>
      )}
      {m.main_text && <p className="mt-1 whitespace-pre-wrap text-xs text-ink-2">{m.main_text}</p>}

      <div className="mt-2">
        <div className="mb-1 text-xs text-ink-3">媒體（{media.length}）— 逐張選擇用在哪</div>
        {media.length === 0 ? (
          <div className="grid h-16 place-items-center rounded-lg border border-dashed bg-surface-2 text-xs text-ink-3">這筆素材沒有媒體</div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {media.map((mm, idx) => (
              <div key={`${mm.url}-${idx}`} className="flex flex-col items-center gap-1">
                <MediaThumb m={mm} />
                <select
                  value={mm.slot ?? "main"}
                  onChange={(e) => setSlot(idx, e.target.value as DraftMedia["slot"])}
                  aria-label="這張媒體用在哪"
                  className="w-24 rounded-lg border px-1 py-0.5 text-xs"
                >
                  {SLOT_OPTS.map((o) => (
                    <option key={o.v} value={o.v}>{o.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        {slotErr && <p className="mt-1 text-xs text-danger" role="alert">{slotErr}</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onAct(m.id, "approve")}
          disabled={busy}
          className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "處理中…" : "✅ 入庫"}
        </button>
        <button
          type="button"
          onClick={() => onAct(m.id, "discard")}
          disabled={busy}
          className="rounded-xl border px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
        >
          ❌ 丟棄
        </button>
      </div>
    </div>
  );
}

// 爬蟲產出的「待審素材」逐筆審核：預覽全部媒體＋標記用途，再 ✅ 入庫（核准）或 ❌ 丟棄（刪除）。
// 入庫 → POST /api/materials/[id]/intake；丟棄 → DELETE /api/materials/[id]；媒體用途 → PATCH /api/materials/[id]。
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
      <p className="text-sm text-ink-2">
        爬蟲抓到的素材（已換好你的分潤連結＋AI 文案）。先看一下媒體、標好每張要放主文還是留言，逐筆確認後才會入庫，入庫的才能排程發文。
      </p>
      <div className="space-y-3">
        {visible.map((m) => (
          <PendingMaterialCard key={m.id} m={m} busy={busyIds.has(m.id)} onAct={act} />
        ))}
      </div>
      {err && <p className="text-xs text-danger" role="alert">{err}</p>}
    </section>
  );
}
