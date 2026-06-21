"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DraftCard from "@/components/DraftCard";
import BulkDraftBar from "@/components/BulkDraftBar";
import type { Draft } from "@/lib/types";
import { maxSimilarity } from "@/lib/text-similarity";

// 與「同帳號近期已發布貼文」高度相似才示警（重複措辭易被降觸及）。
const DUP_THRESHOLD = 0.8;

// 「已排程」＝已核准且排定未來時間（取代原獨立「行事曆」頁）。
const isScheduled = (d: Draft): boolean =>
  d.status === "approved" && !!d.scheduled_at && new Date(d.scheduled_at).getTime() > Date.now();

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "待審" },
  { value: "approved", label: "已核准" },
  { value: "scheduled", label: "已排程" },
  { value: "published", label: "已發布" },
  { value: "failed", label: "失敗" },
  { value: "needs_verification", label: "待確認" },
  { value: "rejected", label: "已退回" }
];

// 草稿搜尋／篩選：依狀態分頁 + 關鍵字（商品名／正文）即時過濾。
export default function DraftsExplorer({
  drafts,
  accountLabels = {},
  sponsor
}: {
  drafts: Draft[];
  accountLabels?: Record<string, string>;
  sponsor?: { enabled: boolean; pickByAccount: Record<string, string> };
}) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // useCallback 穩定參照：讓 DraftCard 的 memo 生效（否則每次 render 新函式會使 memo 失效）。
  const toggleSelect = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );

  // 草稿更新後（批次/單筆操作）自動清除已非「待審」的選取，避免殘留與其他分頁殘影。
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const d of drafts) if (d.status === "draft" && prev.has(d.id)) next.add(d.id);
      return prev.size === next.size ? prev : next;
    });
  }, [drafts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drafts.length };
    for (const d of drafts) {
      c[d.status] = (c[d.status] ?? 0) + 1;
      if (isScheduled(d)) c.scheduled = (c.scheduled ?? 0) + 1;
    }
    return c;
  }, [drafts]);

  // 近重複偵測：未發布草稿 vs 同帳號已發布貼文的最高文案相似度（純前端，零後端成本）。
  const dupMap = useMemo(() => {
    const publishedByAcc = new Map<string, string[]>();
    for (const d of drafts) {
      if (d.status === "published" && d.main_text) {
        const k = d.threads_account_id ?? "";
        (publishedByAcc.get(k) ?? publishedByAcc.set(k, []).get(k)!).push(d.main_text);
      }
    }
    const m: Record<string, number> = {};
    for (const d of drafts) {
      if (!d.main_text || d.status === "published" || d.status === "rejected") continue;
      const others = publishedByAcc.get(d.threads_account_id ?? "") ?? [];
      m[d.id] = maxSimilarity(d.main_text, others);
    }
    return m;
  }, [drafts]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return drafts.filter((d) => {
      if (status === "scheduled") {
        if (!isScheduled(d)) return false;
      } else if (status !== "all" && d.status !== status) {
        return false;
      }
      if (!kw) return true;
      return (
        (d.product_name ?? "").toLowerCase().includes(kw) ||
        (d.main_text ?? "").toLowerCase().includes(kw) ||
        (d.shopee_short_link ?? "").toLowerCase().includes(kw)
      );
    });
  }, [drafts, status, q]);

  // 批次選取：只針對目前篩選結果中的「待審」草稿；選取集與實際待審交集，避免狀態已變的殘留。
  const pendingInView = useMemo(() => filtered.filter((d) => d.status === "draft").map((d) => d.id), [filtered]);
  const selectedPending = useMemo(() => pendingInView.filter((id) => selected.has(id)), [pendingInView, selected]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs ${
                status === t.value ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-neutral-200"
              }`}
            >
              {t.label}
              {counts[t.value] ? ` ${counts[t.value]}` : ""}
            </button>
          ))}
        </div>
        <input
          className="ml-auto w-full rounded-xl border px-3 py-1.5 text-sm sm:w-56"
          placeholder="搜尋商品名／正文／連結"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {pendingInView.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={selectedPending.length === pendingInView.length}
              ref={(el) => {
                if (el) el.indeterminate = selectedPending.length > 0 && selectedPending.length < pendingInView.length;
              }}
              onChange={(e) =>
                setSelected((prev) => {
                  // 聯集/差集：只動目前可見的待審，保留其他篩選下既有選取（可分批累積）。
                  const next = new Set(prev);
                  if (e.target.checked) pendingInView.forEach((id) => next.add(id));
                  else pendingInView.forEach((id) => next.delete(id));
                  return next;
                })
              }
            />
            全選待審（{pendingInView.length}）
          </label>
          {selectedPending.length > 0 && <span className="text-xs text-ink-3">已選 {selectedPending.length} 則</span>}
        </div>
      )}

      {selectedPending.length > 0 && <BulkDraftBar draftIds={selectedPending} />}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            dupSimilarity={dupMap[d.id] >= DUP_THRESHOLD ? dupMap[d.id] : undefined}
            accountLabel={d.threads_account_id ? accountLabels[d.threads_account_id] : undefined}
            sponsorEnabled={sponsor?.enabled ?? false}
            selectable={d.status === "draft"}
            selected={selected.has(d.id)}
            onToggleSelect={toggleSelect}
            isSponsorPick={
              Boolean(sponsor?.enabled) &&
              Boolean(d.threads_account_id) &&
              sponsor?.pickByAccount[d.threads_account_id as string] === d.id
            }
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-2xl border border-dashed p-10 text-center text-ink-3">
            {drafts.length === 0 ? "還沒有草稿。" : "沒有符合條件的草稿。"}
          </div>
        )}
      </div>
    </div>
  );
}
