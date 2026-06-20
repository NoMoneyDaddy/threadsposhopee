"use client";

import { useMemo, useState } from "react";
import DraftCard from "@/components/DraftCard";
import type { Draft } from "@/lib/types";
import { maxSimilarity } from "@/lib/text-similarity";

// 與「同帳號近期已發布貼文」高度相似才示警（重複措辭易被降觸及）。
const DUP_THRESHOLD = 0.8;

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "待審" },
  { value: "approved", label: "已核准" },
  { value: "published", label: "已發布" },
  { value: "failed", label: "失敗" },
  { value: "needs_verification", label: "待確認" },
  { value: "rejected", label: "已退回" }
];

// 草稿搜尋／篩選：依狀態分頁 + 關鍵字（商品名／正文）即時過濾。
export default function DraftsExplorer({
  drafts,
  accountLabels = {}
}: {
  drafts: Draft[];
  accountLabels?: Record<string, string>;
}) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drafts.length };
    for (const d of drafts) c[d.status] = (c[d.status] ?? 0) + 1;
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
      if (status !== "all" && d.status !== status) return false;
      if (!kw) return true;
      return (
        (d.product_name ?? "").toLowerCase().includes(kw) ||
        (d.main_text ?? "").toLowerCase().includes(kw) ||
        (d.shopee_short_link ?? "").toLowerCase().includes(kw)
      );
    });
  }, [drafts, status, q]);

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

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            dupSimilarity={dupMap[d.id] >= DUP_THRESHOLD ? dupMap[d.id] : undefined}
            accountLabel={d.threads_account_id ? accountLabels[d.threads_account_id] : undefined}
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
