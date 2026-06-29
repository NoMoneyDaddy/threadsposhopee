"use client";

import RepostButton from "@/components/RepostButton";
import MaterialRefreshLinkButton from "@/components/MaterialRefreshLinkButton";
import MaterialCopyEditor from "@/components/MaterialCopyEditor";
import EvergreenToggle from "@/components/EvergreenToggle";
import ShareToggle from "@/components/ShareToggle";
import { DeleteButton } from "@/components/RowActions";
import { cloudinaryThumb } from "@/lib/img";
import type { Material, ThreadsAccount } from "@/lib/types";
import type { ItemRevenue } from "@/services/shopee/report";

const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 單筆「已核准」素材卡：商品名／收益標籤／媒體預覽／文案／分潤連結 ＋ 操作
//（再排一篇、編輯文案、刷新連結、常青、分享、刪除）。素材庫頁與工作台看板共用。
export default function MaterialCard({
  m,
  accounts,
  revenue,
  cloud = null,
  preset = null
}: {
  m: Material;
  accounts: ThreadsAccount[];
  revenue?: ItemRevenue;
  cloud?: string | null;
  preset?: string | null;
}) {
  return (
    <div className="flex flex-col rounded-2xl border bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-ink">{m.product_name ?? `商品 ${m.item_id}`}</span>
        <span className="flex shrink-0 items-center gap-1">
          {revenue && (
            <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700" title={`近 30 天分潤：${revenue.count} 筆`}>
              💰 {money(revenue.commission)}
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
        m.media_type === "video" ? (
          <video
            // referrerPolicy 不在 React video 型別內但屬性合法：用 ref 設 DOM 屬性，讓防盜連來源也載得到。
            ref={(el) => el?.setAttribute("referrerpolicy", "no-referrer")}
            src={m.cloudinary_media_url}
            controls
            muted
            playsInline
            preload="metadata"
            className="mb-2 h-40 w-full rounded object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryThumb(m.cloudinary_media_url, 600)} alt="" loading="lazy" referrerPolicy="no-referrer" className="mb-2 h-40 w-full rounded object-cover" />
        )
      )}
      {m.main_text ? (
        <div className="whitespace-pre-wrap text-sm text-ink">{m.main_text}</div>
      ) : (
        <div className="text-sm text-ink-3">（尚未生成文案）</div>
      )}
      {m.affiliate_short_link && (
        <a href={m.affiliate_short_link} target="_blank" rel="noreferrer" className="mt-2 break-all text-xs text-brand hover:underline">
          {m.affiliate_short_link}
        </a>
      )}
      {m.affiliate_sub_id && <div className="text-xs text-ink-3">分潤標記（subId）：{m.affiliate_sub_id}</div>}
      {m.affiliate_checked_at && (
        <div className="mt-1 text-xs text-ink-3">
          連結檢查於 {new Date(m.affiliate_checked_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RepostButton materialId={m.id} threadsAccounts={accounts} />
        <MaterialCopyEditor material={m} accountLabel={accounts[0]?.label} cloud={cloud} preset={preset} />
        <MaterialRefreshLinkButton materialId={m.id} />
        <EvergreenToggle materialId={m.id} initial={Boolean(m.evergreen)} />
        <ShareToggle materialId={m.id} initial={Boolean(m.shared)} />
        <DeleteButton
          endpoint={`/api/materials/${m.id}`}
          confirm={`確定刪除此素材？此動作無法復原${m.shared ? "，且會降低你的貢獻分數（已分享的素材被匯入次數不再計分）" : ""}。`}
        />
      </div>
    </div>
  );
}
