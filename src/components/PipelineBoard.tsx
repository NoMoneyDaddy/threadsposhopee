"use client";

import { useMemo, useState } from "react";
import DraftCard, { type AccountMeta } from "@/components/DraftCard";
import MaterialCard from "@/components/MaterialCard";
import PendingMaterialsReview from "@/components/PendingMaterialsReview";
import SelfComposeForm from "@/components/SelfComposeForm";
import type { Draft, Material, ThreadsAccount } from "@/lib/types";
import type { ItemRevenue } from "@/services/shopee/report";

// 工作台看板：把「待審素材 → 素材庫 → 草稿 → 已排程 → 已發布 → 需處理」整條內容流水線
// 收斂成單一頁面的多欄看板（取代原本分開的發文／素材／草稿三頁）。每欄重用既有卡片元件，
// 卡片上的按鈕（核准／排程／發布／編輯…）即是狀態推進；拖放推進於後續階段再加。

// 「已排程」＝已核准且排定未來時間；其餘 approved（佇列中/已到期待發）也歸此欄。
const isScheduledLike = (d: Draft) => d.status === "approved";
const isPublished = (d: Draft) => d.status === "published" || d.status === "publishing";
const needsAttention = (d: Draft) => d.status === "failed" || d.status === "needs_verification" || d.status === "rejected";

function Column({ title, hint, count, accent, children }: { title: string; hint: string; count: number; accent: string; children: React.ReactNode }) {
  return (
    <section className="flex w-[340px] shrink-0 flex-col rounded-2xl border bg-surface-2/40">
      <header className={`sticky top-0 z-10 rounded-t-2xl border-b bg-surface px-3 py-2 ${accent}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{count}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-tight text-ink-3">{hint}</p>
      </header>
      <div className="flex max-h-[calc(100vh-220px)] flex-col gap-3 overflow-y-auto p-3">
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
  const [composing, setComposing] = useState(false);

  const groups = useMemo(
    () => ({
      drafts: drafts.filter((d) => d.status === "draft"),
      scheduled: drafts.filter(isScheduledLike),
      published: drafts.filter(isPublished),
      attention: drafts.filter(needsAttention)
    }),
    [drafts]
  );

  const renderDraft = (d: Draft) => (
    <DraftCard
      key={d.id}
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
        Boolean(sponsor?.enabled) &&
        Boolean(d.threads_account_id) &&
        sponsor?.pickByAccount[d.threads_account_id as string] === d.id
      }
    />
  );

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
        <span className="text-xs text-ink-3">直接打字發文／排程，或從下方素材庫「再排一篇」。</span>
      </div>

      {composing && <SelfComposeForm threadsAccounts={accounts} cloud={cloud} preset={preset} />}

      <div className="flex gap-4 overflow-x-auto pb-4">
        <Column title="🔎 待審素材" hint="爬蟲抓回、已換好分潤連結，逐筆審核入庫" count={pending.length} accent="text-amber-700">
          <PendingMaterialsReview items={pending} accounts={accounts} />
        </Column>

        <Column title="🧺 素材庫" hint="已入庫、可重複再排一篇（不重燒 token）" count={materials.length} accent="">
          {materials.map((m) => (
            <MaterialCard key={m.id} m={m} accounts={accounts} revenue={itemRev[m.item_id]} cloud={cloud} preset={preset} />
          ))}
        </Column>

        <Column title="📝 草稿" hint="AI 文案待審：可編輯、AI 重寫，核准後進排程" count={groups.drafts.length} accent="">
          {groups.drafts.map(renderDraft)}
        </Column>

        <Column title="📅 已排程" hint="已核准、排進佇列等發布（依防封節奏）" count={groups.scheduled.length} accent="">
          {groups.scheduled.map(renderDraft)}
        </Column>

        <Column title="✅ 已發布" hint="已發出（含延遲留言補發）" count={groups.published.length} accent="text-green-700">
          {groups.published.map(renderDraft)}
        </Column>

        <Column title="⚠️ 需處理" hint="失敗／待確認／已退回，可重試或刪除" count={groups.attention.length} accent="text-red-700">
          {groups.attention.map(renderDraft)}
        </Column>
      </div>
    </div>
  );
}
