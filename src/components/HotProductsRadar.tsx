import Link from "next/link";
import ImportSharedButton from "@/components/ImportSharedButton";
import { cloudinaryThumb } from "@/lib/img";
import { isTopMaterial } from "@/lib/roles";
import type { SharedMaterial } from "@/lib/store";

// 選品雷達：全站最熱門的共享商品榜（匯入＋收藏加權）。點「匯入」用自己金鑰重產分潤連結。
export default function HotProductsRadar({ items }: { items: SharedMaterial[] }) {
  if (items.length === 0) return null;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="section-title text-base">📡 選品雷達 · 全站熱門</h2>
        <Link href="/shared" className="text-xs text-brand">逛共享庫 →</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2">
            <span className="w-5 shrink-0 text-center text-sm font-bold tabular-nums text-ink-3">{i + 1}</span>
            {m.cloudinary_media_url && m.media_type !== "none" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cloudinaryThumb(m.cloudinary_media_url, 96)} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded object-cover" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded bg-surface-2 text-ink-3">🛒</span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink">
                {isTopMaterial(m.import_count, m.favorite_count) && <span className="mr-1" title="頂級素材">🔥</span>}
                {m.product_name ?? "（商品）"}
              </div>
              <div className="text-[11px] text-ink-3">匯入 {m.import_count}・收藏 {m.favorite_count}</div>
            </div>
            <div className="min-w-0">
              <ImportSharedButton id={m.id} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
