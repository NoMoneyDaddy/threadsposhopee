"use client";

import { useMemo, useState } from "react";
import RepostButton from "@/components/RepostButton";
import EvergreenToggle from "@/components/EvergreenToggle";
import ShareToggle from "@/components/ShareToggle";
import EmptyState from "@/components/EmptyState";
import { DeleteButton } from "@/components/RowActions";
import { cloudinaryThumb } from "@/lib/img";
import type { Material, ThreadsAccount } from "@/lib/types";
import type { ItemRevenue } from "@/services/shopee/report";

const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 素材列表 + 關鍵字搜尋（商品名／文案／連結／商品 id 即時過濾）。大量素材時免捲動找。
export default function MaterialsExplorer({
  materials,
  accounts,
  itemRev
}: {
  materials: Material[];
  accounts: ThreadsAccount[];
  itemRev: Record<string, ItemRevenue>;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return materials;
    return materials.filter(
      (m) =>
        (m.product_name ?? "").toLowerCase().includes(kw) ||
        (m.main_text ?? "").toLowerCase().includes(kw) ||
        (m.affiliate_short_link ?? "").toLowerCase().includes(kw) ||
        m.item_id.toLowerCase().includes(kw)
    );
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
          <div key={m.id} className="flex flex-col rounded-2xl border bg-surface p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-ink">{m.product_name ?? `商品 ${m.item_id}`}</span>
              <span className="flex shrink-0 items-center gap-1">
                {itemRev[m.item_id] && (
                  <span
                    className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                    title={`近 30 天分潤：${itemRev[m.item_id].count} 筆`}
                  >
                    💰 {money(itemRev[m.item_id].commission)}
                  </span>
                )}
                {!m.affiliate_valid && (
                  <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600" title="連結已失效或無法存取；重新「再排一篇」時系統會自動重產分潤連結">
                    連結失效
                  </span>
                )}
              </span>
            </div>
            {m.cloudinary_media_url && m.media_type !== "none" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryThumb(m.cloudinary_media_url, 600)} alt="" loading="lazy" className="mb-2 h-32 w-full rounded object-cover" />
            )}
            {m.main_text ? (
              <div className="whitespace-pre-wrap text-sm text-ink">{m.main_text}</div>
            ) : (
              <div className="text-sm text-ink-3">（尚未生成文案）</div>
            )}
            <a href={m.affiliate_short_link ?? "#"} target="_blank" rel="noreferrer" className="mt-2 text-xs text-brand hover:underline">
              {m.affiliate_short_link}
            </a>
            {m.affiliate_sub_id && <div className="text-xs text-ink-3">分潤標記（subId）：{m.affiliate_sub_id}</div>}
            {m.affiliate_checked_at && (
              <div className="mt-1 text-xs text-ink-3">
                連結檢查於 {new Date(m.affiliate_checked_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RepostButton materialId={m.id} threadsAccounts={accounts} />
              <EvergreenToggle materialId={m.id} initial={Boolean(m.evergreen)} />
              <ShareToggle materialId={m.id} initial={Boolean(m.shared)} />
              <DeleteButton
                endpoint={`/api/materials/${m.id}`}
                confirm={`確定刪除此素材？此動作無法復原${m.shared ? "，且會降低你的貢獻分數（已分享的素材被匯入次數不再計分）" : ""}。`}
              />
            </div>
          </div>
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
