"use client";

import { useMemo, useState } from "react";
import MaterialCard from "@/components/MaterialCard";
import EmptyState from "@/components/EmptyState";
import type { Material, ThreadsAccount } from "@/lib/types";
import type { ItemRevenue } from "@/services/shopee/report";

// 關鍵字比對（純函式、可單測）：商品名／文案／短連結／商品 id 任一含關鍵字即命中。
// kw 須為已 trim+toLowerCase 的關鍵字；空字串視為全部命中。
export function materialMatches(m: Material, kw: string): boolean {
  if (!kw) return true;
  return (
    (m.product_name ?? "").toLowerCase().includes(kw) ||
    (m.main_text ?? "").toLowerCase().includes(kw) ||
    (m.affiliate_short_link ?? "").toLowerCase().includes(kw) ||
    m.item_id.toLowerCase().includes(kw)
  );
}

// 素材列表 + 關鍵字搜尋（商品名／文案／連結／商品 id 即時過濾）。大量素材時免捲動找。
export default function MaterialsExplorer({
  materials,
  accounts,
  itemRev,
  cloud = null,
  preset = null
}: {
  materials: Material[];
  accounts: ThreadsAccount[];
  itemRev: Record<string, ItemRevenue>;
  cloud?: string | null;
  preset?: string | null;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return kw ? materials.filter((m) => materialMatches(m, kw)) : materials;
  }, [materials, q]);

  return (
    <div className="space-y-4">
      {materials.length > 0 && (
        <input
          className="w-full rounded-xl border px-3 py-1.5 text-sm sm:w-72"
          placeholder="搜尋商品名／文案／連結"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="搜尋素材"
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((m) => (
          <MaterialCard key={m.id} m={m} accounts={accounts} revenue={itemRev[m.item_id]} cloud={cloud} preset={preset} />
        ))}
        {materials.length === 0 && (
          <div className="col-span-2">
            <EmptyState
              icon="🧺"
              title="還沒有素材"
              hint="用上面的表單貼一個蝦皮商品連結即可建立素材；之後可在發文頁直接挑用，或讓自動抓文流程幫你產生。"
              cta={{ href: "/compose", label: "前往發文" }}
            />
          </div>
        )}
        {materials.length > 0 && filtered.length === 0 && (
          <div className="col-span-2 rounded-2xl border border-dashed border-strong bg-surface/50 p-10 text-center">
            <div className="text-4xl" aria-hidden>🔍</div>
            <p className="mt-3 text-sm text-ink-2">沒有符合「{q}」的素材。</p>
            <button type="button" onClick={() => setQ("")} className="btn btn-ghost btn-sm mt-4">
              清除搜尋
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
