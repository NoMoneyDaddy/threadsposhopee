"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Material, DraftMedia, ThreadsAccount } from "@/lib/types";
import { cloudinaryThumb, videoFirstFrameSrc } from "@/lib/img";
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
        // referrerPolicy 不在 React 的 video 型別內，但屬性本身合法且新版瀏覽器支援；
        // 用 ref 直接設 DOM 屬性，讓防盜連的來源影片也載得到（與圖片一致）。
        ref={(el) => el?.setAttribute("referrerpolicy", "no-referrer")}
        src={videoFirstFrameSrc(m.url)}
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
  canSchedule,
  canShare,
  onAct
}: {
  m: Material;
  busy: boolean;
  canSchedule: boolean;
  canShare: boolean;
  onAct: (id: string, kind: "approve" | "discard" | "approveSchedule" | "approveShare") => void;
}) {
  const [media, setMedia] = useState<DraftMedia[]>(() => normalizeDraftMedia(m).map((x) => ({ ...x, slot: x.slot ?? "main" })));
  const [slotErr, setSlotErr] = useState<string | null>(null);
  // 序列化保存：避免快速連點時並行 PATCH 互相覆蓋，且樂觀更新的回復不被後續請求蓋掉。
  const [saving, setSaving] = useState(false);

  async function setSlot(idx: number, slot: DraftMedia["slot"]) {
    if (saving) return; // 前一筆還在存就忽略，避免競態
    const prev = media;
    const next = media.map((x, i) => (i === idx ? { ...x, slot } : x));
    setMedia(next);
    setSlotErr(null);
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border bg-surface p-3">
      <p className="truncate font-medium">{m.product_name || `商品 ${m.item_id}`}</p>
      {m.affiliate_short_link && (
        <a href={m.affiliate_short_link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-brand hover:underline">
          你的分潤連結：{m.affiliate_short_link}
        </a>
      )}
      {m.clean_product_url && (
        <a href={m.clean_product_url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-ink-3 hover:underline">
          原始商品連結：{m.clean_product_url}
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
                  disabled={saving || busy}
                  onChange={(e) => setSlot(idx, e.target.value as DraftMedia["slot"])}
                  aria-label="這張媒體用在哪"
                  className="w-24 rounded-lg border px-1 py-0.5 text-xs disabled:opacity-50"
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
          disabled={busy || saving}
          title={saving ? "媒體用途儲存中…" : "只入庫，之後再到素材庫排程"}
          className="rounded-xl bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "處理中…" : "✅ 只入庫"}
        </button>
        {canSchedule && (
          <button
            type="button"
            onClick={() => onAct(m.id, "approveSchedule")}
            disabled={busy || saving}
            title="入庫並直接排進下一個空時段（省去再到素材庫排一篇）"
            className="rounded-xl border border-brand/50 px-3 py-1.5 text-sm font-medium text-brand hover:bg-orange-50 disabled:opacity-50"
          >
            {busy ? "處理中…" : "✅ 核准並排程"}
          </button>
        )}
        {canShare && (
          <button
            type="button"
            onClick={() => onAct(m.id, "approveShare")}
            disabled={busy || saving}
            title="入庫並同時分享商品到共享庫（不含你的分潤連結）"
            className="rounded-xl border border-info/50 px-3 py-1.5 text-sm font-medium text-info hover:bg-sky-50 disabled:opacity-50"
          >
            {busy ? "處理中…" : "✅ 入庫並分享"}
          </button>
        )}
        <button
          type="button"
          onClick={() => onAct(m.id, "discard")}
          disabled={busy || saving}
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
export default function PendingMaterialsReview({
  items,
  accounts = [],
  canShare = false
}: {
  items: Material[];
  accounts?: ThreadsAccount[];
  canShare?: boolean;
}) {
  const router = useRouter();
  // 用 Set 追蹤每筆獨立的處理中狀態：避免快速連點多筆時，單一 busyId 互相覆蓋造成按鈕提早解禁（race）。
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  // 成功處理過的 id：在 router.refresh() 帶回新資料前先本地隱藏，避免舊卡片仍可點而對同一筆重複送出。
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [accId, setAccId] = useState(accounts[0]?.id ?? "");
  const canSchedule = accounts.length > 0;

  async function act(id: string, kind: "approve" | "discard" | "approveSchedule" | "approveShare") {
    setBusyIds((prev) => new Set(prev).add(id));
    setErr(null);
    try {
      if (kind === "discard") {
        const res = await fetch(`/api/materials/${id}`, { method: "DELETE" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" && json.error ? json.error : `操作失敗（HTTP ${res.status}）`);
      } else {
        // 入庫（核准）
        const res = await fetch(`/api/materials/${id}/intake`, { method: "POST" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" && json.error ? json.error : `入庫失敗（HTTP ${res.status}）`);
        // 核准並排程：入庫後直接排進下一個空時段（省去再到素材庫「再排一篇」）。
        // 入庫已成功（DB 已是 approved），故排程失敗也要把此筆標記完成＋刷新，避免重複入庫；
        // 失敗訊息照樣拋出提示使用者（素材已在庫，可到素材庫手動排程）。
        if (kind === "approveSchedule") {
          try {
            if (!accId) throw new Error("沒有可用的發文帳號");
            const r2 = await fetch("/api/materials/repost", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ material_id: id, threads_account_id: accId, action: "queue" })
            });
            const j2 = await r2.json().catch(() => null);
            if (!r2.ok || !j2?.ok) throw new Error(typeof j2?.error === "string" && j2.error ? j2.error : `已入庫，但排程失敗（HTTP ${r2.status}）；可到素材庫手動排程`);
          } catch (scheduleErr) {
            setDoneIds((prev) => new Set(prev).add(id));
            router.refresh();
            throw scheduleErr;
          }
        }
        // 入庫並分享：入庫後把商品分享進共享庫（不含分潤連結）。入庫已成功，
        // 故分享失敗也標記完成＋刷新（避免重複入庫）；失敗訊息照樣提示（可到素材庫手動分享）。
        if (kind === "approveShare") {
          try {
            const r2 = await fetch("/api/materials/share", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ material_id: id, on: true })
            });
            const j2 = await r2.json().catch(() => null);
            if (!r2.ok || !j2?.ok) throw new Error(typeof j2?.error === "string" && j2.error ? j2.error : `已入庫，但分享失敗（HTTP ${r2.status}）；可到素材庫手動分享`);
          } catch (shareErr) {
            setDoneIds((prev) => new Set(prev).add(id));
            router.refresh();
            throw shareErr;
          }
        }
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
        爬蟲抓到的素材（已換好你的分潤連結）。先看一下媒體、標好每張要放主文還是留言，逐筆確認後才會入庫，入庫的才能排程發文。
      </p>
      {accounts.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          排程到帳號：
          <select className="rounded border px-2 py-1 text-xs" value={accId} onChange={(e) => setAccId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
      )}
      <div className="space-y-3">
        {visible.map((m) => (
          <PendingMaterialCard key={m.id} m={m} busy={busyIds.has(m.id)} canSchedule={canSchedule} canShare={canShare} onAct={act} />
        ))}
      </div>
      {err && <p className="text-xs text-danger" role="alert">{err}</p>}
    </section>
  );
}
