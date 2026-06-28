import MaterialCreateForm from "@/components/MaterialCreateForm";
import CheckLinksButton from "@/components/CheckLinksButton";
import BulkRepostButton from "@/components/BulkRepostButton";
import MaterialsExplorer from "@/components/MaterialsExplorer";
import { listMaterials, listThreadsAccounts, getUserCloudinary } from "@/lib/store";
import { getItemRevenueMap, type ItemRevenue } from "@/services/shopee/report";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [materialsRaw, accounts, ownCloud] = await Promise.all([
    listMaterials(ownerId),
    listThreadsAccounts(ownerId),
    user ? getUserCloudinary(ownerId) : Promise.resolve(null)
  ]);
  const cc = ownCloud?.cloud && ownCloud?.preset ? ownCloud : null;

  // 成效回灌：有自綁 Shopee 金鑰時（getItemRevenueMap 內部判斷），抓 itemId→佣金 對照（快取），
  // 把賺錢素材排前並標收益；沒綁則回空物件、維持原順序。
  let itemRev: Record<string, ItemRevenue> = {};
  if (!isDemoMode) {
    itemRev = await getItemRevenueMap(ownerId, 30).catch(() => ({}));
  }
  const revOf = (itemId: string) => itemRev[itemId]?.commission ?? 0;
  // 有收益的排前（佣金高→低）；其餘維持原本（建立時間新→舊）順序，穩定排序不打亂無收益素材。
  const materials = [...materialsRaw].sort((a, b) => revOf(b.item_id) - revOf(a.item_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">素材</h1>
        <div className="flex flex-wrap items-center gap-3">
          <BulkRepostButton threadsAccounts={accounts} />
          <CheckLinksButton />
        </div>
      </div>
      <p className="text-sm text-ink-2">
        每個素材 = 一個商品的分潤連結＋AI 文案＋媒體。可重複「再排一篇」而不重燒 token；連結失效才會重產。
      </p>

      <MaterialCreateForm cloud={cc?.cloud ?? null} preset={cc?.preset ?? null} />

      <MaterialsExplorer materials={materials} accounts={accounts} itemRev={itemRev} />
    </div>
  );
}
