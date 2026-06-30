"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import DraftCard, { type AccountMeta } from "@/components/DraftCard";
import MaterialCard from "@/components/MaterialCard";
import MaterialCreateForm from "@/components/MaterialCreateForm";
import PendingMaterialsReview from "@/components/PendingMaterialsReview";
import SelfComposeForm from "@/components/SelfComposeForm";
import CheckLinksButton from "@/components/CheckLinksButton";
import BulkRepostButton from "@/components/BulkRepostButton";
import RetryFailedBar from "@/components/RetryFailedBar";
import type { Draft, Material, ThreadsAccount } from "@/lib/types";
import type { ItemRevenue } from "@/services/shopee/report";

// 工作台看板：把整條內容流水線（待審素材 → 素材庫 → 草稿 → 已排程 → 已發布 → 需處理）
// 收進單頁多欄看板。每欄重用既有卡片元件，卡片按鈕即狀態推進。
// 拖放（Phase 2）：草稿類卡片可拖到「已排程」(核准/重試) 或「需處理」(退回)；
// 「已發布」一律走按鈕（發文不可逆，不用拖放避免誤觸）。

type DraftStatus = Draft["status"];
const isScheduledLike = (s: DraftStatus) => s === "approved";
const isPublished = (s: DraftStatus) => s === "published" || s === "publishing";
const needsAttention = (s: DraftStatus) => s === "failed" || s === "needs_verification" || s === "rejected";

// 由「來源狀態 + 目標欄」算出要呼叫的 drafts/action，與卡片按鈕一致。null＝該拖放無動作（彈回）。
function resolveDrop(status: DraftStatus, col: string): { action: "approve" | "reject" | "retry"; next: DraftStatus } | null {
  if (col === "scheduled") {
    if (status === "draft") return { action: "approve", next: "approved" };
    if (status === "failed" || status === "needs_verification") return { action: "retry", next: "approved" };
    return null;
  }
  if (col === "attention") {
    if (status === "draft" || status === "approved") return { action: "reject", next: "rejected" };
    return null;
  }
  return null;
}

function DraggableCard({ id, status, children }: { id: string; status: DraftStatus; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { status } });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-50" : ""}>
      <button
        type="button"
        {...listeners}
        {...attributes}
        aria-label="拖曳以變更狀態"
        title="拖曳到其他欄位以變更狀態"
        className="mb-1 flex w-full cursor-grab items-center justify-center rounded-lg border border-dashed border-border py-0.5 text-ink-3 hover:bg-surface-2 active:cursor-grabbing"
      >
        ⠿
      </button>
      {children}
    </div>
  );
}

function Column({
  id,
  title,
  hint,
  count,
  accent,
  droppable,
  active,
  children
}: {
  id: string;
  title: string;
  hint: string;
  count: number;
  accent: string;
  droppable: boolean;
  active: boolean; // 拖曳中且此欄為合法目標 → 高亮
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  return (
    <section className="flex w-[340px] shrink-0 flex-col rounded-2xl border bg-surface-2/40">
      <header className={`sticky top-0 z-10 rounded-t-2xl border-b bg-surface px-3 py-2 ${accent}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{count}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{hint}</p>
      </header>
      <div
        ref={setNodeRef}
        className={`flex max-h-[calc(100vh-220px)] flex-col gap-3 overflow-y-auto rounded-b-2xl p-3 transition-colors ${
          active ? (isOver ? "bg-brand/10 ring-2 ring-brand" : "ring-1 ring-brand/40") : ""
        }`}
      >
        {count === 0 ? <p className="py-6 text-center text-xs text-ink-3">（沒有項目）</p> : children}
      </div>
    </section>
  );
}

export default function PipelineBoard({
  pending,
  materials,
  itemRev,
  drafts,
  accounts,
  accountMeta = {},
  defaultAccount,
  sponsor,
  cloud = null,
  preset = null
}: {
  pending: Material[];
  materials: Material[];
  itemRev: Record<string, ItemRevenue>;
  drafts: Draft[];
  accounts: ThreadsAccount[];
  accountMeta?: Record<string, AccountMeta>;
  defaultAccount?: AccountMeta;
  sponsor?: { enabled: boolean; pickByAccount: Record<string, string> };
  cloud?: string | null;
  preset?: string | null;
}) {
  const router = useRouter();
  const [composing, setComposing] = useState(false);
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  // 樂觀更新：拖放後先本地改狀態，API 成功再 router.refresh()（帶回真實資料時清掉覆寫）。
  const [overrides, setOverrides] = useState<Record<string, DraftStatus>>({});
  const [dragStatus, setDragStatus] = useState<DraftStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 滑鼠需移動 8px 才算拖曳（否則點按鈕/編輯不會誤觸）；觸控長按 200ms 啟動（手機可拖）。
  // MouseSensor（滑鼠）與 TouchSensor（觸控）分流：避免單一 PointerSensor 在手機上搶走捲動手勢。
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // 後端帶回新資料時，只清除「實際狀態已與樂觀狀態一致」的覆寫，保留其他仍進行中的拖放，避免閃爍/彈回。
  useEffect(() => {
    setOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of drafts) {
        if (next[d.id] === d.status) {
          delete next[d.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [drafts]);

  const effStatus = (d: Draft): DraftStatus => overrides[d.id] ?? d.status;
  const groups = useMemo(() => {
    const g = { drafts: [] as Draft[], scheduled: [] as Draft[], published: [] as Draft[], attention: [] as Draft[] };
    for (const d of drafts) {
      const s = overrides[d.id] ?? d.status;
      if (s === "draft") g.drafts.push(d);
      else if (isScheduledLike(s)) g.scheduled.push(d);
      else if (isPublished(s)) g.published.push(d);
      else if (needsAttention(s)) g.attention.push(d);
    }
    // 已排程：最接近發文時間（scheduled_at 最早）的排最上方；未排時間者沉底。
    g.scheduled.sort((a, b) => (a.scheduled_at ?? "9999").localeCompare(b.scheduled_at ?? "9999"));
    // 已發布：最新發出的（published_at 最晚）排最上方；無時間者沉底。
    g.published.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
    return g;
  }, [drafts, overrides]);

  async function onDragEnd(e: DragEndEvent) {
    setDragStatus(null);
    const id = String(e.active.id);
    const col = e.over ? String(e.over.id) : "";
    const status = (e.active.data.current?.status as DraftStatus) ?? null;
    if (!status || !col) return;
    const plan = resolveDrop(status, col);
    if (!plan) return; // 非合法目標：彈回，不動作
    setErr(null);
    setOverrides((prev) => ({ ...prev, [id]: plan.next })); // 樂觀移動
    try {
      const res = await fetch("/api/drafts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: plan.action })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(typeof json?.error === "string" ? json.error : `操作失敗（HTTP ${res.status}）`);
      router.refresh();
    } catch (e2) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id]; // 失敗回復
        return next;
      });
      setErr(e2 instanceof Error ? e2.message : "操作失敗");
    }
  }

  // 拖曳中，依來源狀態算出哪些欄是合法目標 → 高亮提示。
  const validTarget = (col: string) => dragStatus != null && resolveDrop(dragStatus, col) != null;

  // 發布失敗的草稿 → 一鍵全部重排（沿用既有 RetryFailedBar）。
  const failedIds = useMemo(() => drafts.filter((d) => (overrides[d.id] ?? d.status) === "failed").map((d) => d.id), [drafts, overrides]);

  const renderDraft = (d: Draft, draggable: boolean) => {
    const card = (
      <DraftCard
        draft={d}
        account={d.threads_account_id ? accountMeta[d.threads_account_id] : undefined}
        fallbackAccount={defaultAccount}
        sponsorEnabled={sponsor?.enabled ?? false}
        cloud={cloud}
        preset={preset}
        selectable={false}
        selected={false}
        onToggleSelect={() => {}}
        isSponsorPick={
          Boolean(sponsor?.enabled) && !!d.threads_account_id && sponsor?.pickByAccount?.[d.threads_account_id] === d.id
        }
      />
    );
    return draggable ? (
      <DraggableCard key={d.id} id={d.id} status={effStatus(d)}>
        {card}
      </DraggableCard>
    ) : (
      <div key={d.id}>{card}</div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {composing ? "✕ 收起" : "＋ 新貼文"}
        </button>
        <button
          type="button"
          onClick={() => setCreatingMaterial((v) => !v)}
          className="rounded-xl border border-brand/40 px-4 py-2 text-sm font-medium text-brand hover:bg-orange-50"
        >
          {creatingMaterial ? "✕ 收起" : "＋ 建立素材"}
        </button>
        <BulkRepostButton threadsAccounts={accounts} />
        <CheckLinksButton />
      </div>
      <p className="text-xs text-ink-3">直接打字發文／排程，或從素材庫「再排一篇」。草稿卡可拖曳變更狀態。</p>

      {composing && <SelfComposeForm threadsAccounts={accounts} cloud={cloud} preset={preset} />}
      {creatingMaterial && <MaterialCreateForm cloud={cloud} preset={preset} />}
      {failedIds.length > 0 && <RetryFailedBar failedIds={failedIds} />}
      {err && <p className="text-sm text-danger" role="alert">❌ {err}</p>}

      <p className="text-xs text-ink-3">👉 左右滑動切換欄位：待審素材 → 素材庫 → 草稿 → 已排程 → 已發布 → 需處理</p>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragStatus((e.active.data.current?.status as DraftStatus) ?? null)}
        onDragCancel={() => setDragStatus(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          <Column id="pending" title="🔎 待審素材" hint="爬蟲抓回、已換好分潤連結，逐筆審核入庫" count={pending.length} accent="text-amber-700" droppable={false} active={false}>
            <PendingMaterialsReview items={pending} accounts={accounts} />
          </Column>

          <Column id="materials" title="🧺 素材庫" hint="已入庫、可重複再排一篇（不重燒 token）" count={materials.length} accent="" droppable={false} active={false}>
            {materials.map((m) => (
              <MaterialCard key={m.id} m={m} accounts={accounts} revenue={itemRev[m.item_id]} cloud={cloud} preset={preset} />
            ))}
          </Column>

          <Column id="draft" title="📝 草稿" hint="AI 文案待審：拖到「已排程」即核准" count={groups.drafts.length} accent="" droppable={false} active={false}>
            {groups.drafts.map((d) => renderDraft(d, true))}
          </Column>

          <Column id="scheduled" title="📅 已排程" hint="已核准、排進佇列等發布；拖入＝核准/重試" count={groups.scheduled.length} accent="" droppable active={validTarget("scheduled")}>
            {groups.scheduled.map((d) => renderDraft(d, true))}
          </Column>

          <Column id="published" title="✅ 已發布" hint="已發出（含延遲留言補發）" count={groups.published.length} accent="text-green-700" droppable={false} active={false}>
            {groups.published.map((d) => renderDraft(d, false))}
          </Column>

          <Column id="attention" title="⚠️ 需處理" hint="失敗／待確認／已退回；拖入＝退回" count={groups.attention.length} accent="text-red-700" droppable active={validTarget("attention")}>
            {groups.attention.map((d) => renderDraft(d, true))}
          </Column>
        </div>
      </DndContext>
    </div>
  );
}
