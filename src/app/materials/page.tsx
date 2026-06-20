import MaterialCreateForm from "@/components/MaterialCreateForm";
import RepostButton from "@/components/RepostButton";
import CheckLinksButton from "@/components/CheckLinksButton";
import BulkRepostButton from "@/components/BulkRepostButton";
import { listMaterials, listThreadsAccounts } from "@/lib/store";
import { getItemRevenueMap, type ItemRevenue } from "@/services/shopee/report";
import { getCurrentUser } from "@/lib/auth";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

const money = (n: number) => `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function MaterialsPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const isOwner = user?.isOwner ?? isDemoMode;
  const [materialsRaw, accounts] = await Promise.all([listMaterials(ownerId), listThreadsAccounts(ownerId)]);

  // 成效回灌：owner 且有 Shopee 金鑰時，抓 itemId→佣金 對照（快取），把賺錢素材排前並標收益。
  let itemRev: Record<string, ItemRevenue> = {};
  if (isOwner && !isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    itemRev = await getItemRevenueMap(ownerId, 30).catch(() => ({}));
  }
  const revOf = (itemId: string) => itemRev[itemId]?.commission ?? 0;
  // 有收益的排前（佣金高→低）；其餘維持原本（建立時間新→舊）順序，穩定排序不打亂無收益素材。
  const materials = [...materialsRaw].sort((a, b) => revOf(b.item_id) - revOf(a.item_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">素材庫</h1>
        <div className="flex flex-wrap items-center gap-3">
          <BulkRepostButton threadsAccounts={accounts} />
          <CheckLinksButton />
        </div>
      </div>
      <p className="text-sm text-neutral-500">
        每個素材 = 一個商品的分潤連結＋AI 文案＋媒體。可重複「再排一篇」而不重燒 token；連結失效才會重產。
      </p>

      <MaterialCreateForm />

      <div className="grid gap-4 md:grid-cols-2">
        {materials.map((m) => (
          <div key={m.id} className="flex flex-col rounded-lg border bg-white p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-neutral-700">{m.product_name ?? `商品 ${m.item_id}`}</span>
              <span className="flex shrink-0 items-center gap-1">
                {itemRev[m.item_id] && (
                  <span
                    className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                    title={`近 30 天分潤：${itemRev[m.item_id].count} 筆`}
                  >
                    💰 {money(itemRev[m.item_id].commission)}
                  </span>
                )}
                {!m.affiliate_valid && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">連結失效</span>}
              </span>
            </div>
            {m.cloudinary_media_url && m.media_type !== "none" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.cloudinary_media_url} alt="" className="mb-2 h-32 w-full rounded object-cover" />
            )}
            {m.main_text ? (
              <div className="whitespace-pre-wrap text-sm text-neutral-800">{m.main_text}</div>
            ) : (
              <div className="text-sm text-neutral-400">（尚未生成文案）</div>
            )}
            <a
              href={m.affiliate_short_link ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-2 text-xs text-shopee hover:underline"
            >
              {m.affiliate_short_link}
            </a>
            {m.affiliate_sub_id && <div className="text-xs text-neutral-400">subId: {m.affiliate_sub_id}</div>}
            {m.affiliate_checked_at && (
              <div className="mt-1 text-xs text-neutral-300">
                連結檢查於 {new Date(m.affiliate_checked_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
              </div>
            )}
            <div className="mt-3">
              <RepostButton materialId={m.id} threadsAccounts={accounts} />
            </div>
          </div>
        ))}
        {materials.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed p-10 text-center text-neutral-400">
            還沒有素材。用上面的表單貼一個蝦皮連結建立，或讓爬取流程自動產生。
          </div>
        )}
      </div>
    </div>
  );
}
