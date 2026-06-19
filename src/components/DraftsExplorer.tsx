"use client";

import { useMemo, useState } from "react";
import DraftCard from "@/components/DraftCard";
import type { Draft } from "@/lib/types";

const STATUS_TABS: { value: string; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "draft", label: "待審" },
  { value: "approved", label: "已核准" },
  { value: "published", label: "已發布" },
  { value: "failed", label: "失敗" },
  { value: "rejected", label: "已退回" }
];

// 草稿搜尋／篩選：依狀態分頁 + 關鍵字（商品名／正文）即時過濾。
export default function DraftsExplorer({ drafts }: { drafts: Draft[] }) {
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: drafts.length };
    for (const d of drafts) c[d.status] = (c[d.status] ?? 0) + 1;
    return c;
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
                status === t.value ? "bg-shopee text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {t.label}
              {counts[t.value] ? ` ${counts[t.value]}` : ""}
            </button>
          ))}
        </div>
        <input
          className="ml-auto w-full rounded-md border px-3 py-1.5 text-sm sm:w-56"
          placeholder="搜尋商品名／正文／連結"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed p-10 text-center text-neutral-400">
            {drafts.length === 0 ? "還沒有草稿。" : "沒有符合條件的草稿。"}
          </div>
        )}
      </div>
    </div>
  );
}
