import PipelineBoard from "@/components/PipelineBoard";
import { listDrafts, listMaterials, listPendingMaterials, listThreadsAccounts, getPublishPlan } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { getMediaProvider } from "@/services/media/upload";
import { getSponsorConfig, getSponsorPickMap } from "@/lib/sponsor";
import { getItemRevenueMap, type ItemRevenue } from "@/services/shopee/report";

export const dynamic = "force-dynamic";

// 工作台：把「待審素材 → 素材庫 → 草稿 → 已排程 → 已發布 → 需處理」整條流水線收進單頁看板。
// 合併原發文／素材／草稿三頁的資料載入。
export default async function PipelinePage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [drafts, materialsRaw, pending, accounts, provider, plan] = await Promise.all([
    listDrafts(ownerId),
    listMaterials(ownerId),
    listPendingMaterials(ownerId),
    listThreadsAccounts(ownerId),
    user ? getMediaProvider(ownerId) : Promise.resolve({ kind: "none" as const }),
    // 已排程草稿的「預計自動發文時間＋原因」（間隔等待／每日上限…）：讓使用者一眼看到何時會發、為何還沒發。
    user && !isDemoMode ? getPublishPlan(ownerId).catch(() => []) : Promise.resolve([])
  ]);
  const cc = provider.kind === "cloudinary" ? provider.creds : null;
  const publishPlan = Object.fromEntries(plan.map((r) => [r.id, { etaIso: r.etaIso, reason: r.reason }]));

  // 排序：先把「還沒文案」的素材置頂（方便優先補文案編輯），同組內再依成效（賺錢素材排前）。
  let itemRev: Record<string, ItemRevenue> = {};
  if (!isDemoMode) itemRev = await getItemRevenueMap(ownerId, 30).catch(() => ({}));
  const revOf = (itemId: string) => itemRev[itemId]?.commission ?? 0;
  const hasCopy = (m: (typeof materialsRaw)[number]) => Boolean(m.main_text && m.main_text.trim());
  const materials = [...materialsRaw].sort((a, b) => {
    if (hasCopy(a) !== hasCopy(b)) return hasCopy(a) ? 1 : -1; // 沒文案的排前
    return revOf(b.item_id) - revOf(a.item_id);
  });

  // 草稿卡：帳號身分（頭像/暱稱）＋未指定帳號退回第一個帳號。
  const accountMeta = Object.fromEntries(
    accounts.map((a) => [a.id, { label: a.label, displayName: a.display_name ?? null, avatarUrl: a.avatar_url ?? null }])
  );
  const firstAccount = accounts[0];
  const defaultAccount = firstAccount
    ? { label: firstAccount.label, displayName: firstAccount.display_name ?? null, avatarUrl: firstAccount.avatar_url ?? null }
    : undefined;

  // 贊助文：啟用且非 owner 時可標示／自選。
  const sponsorCfg = await getSponsorConfig();
  const sponsorEnabled = sponsorCfg.enabled && !!user && !user.isOwner;
  const pickByAccount = sponsorEnabled ? await getSponsorPickMap(accounts.map((a) => a.id)) : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">工作台</h1>
      </div>
      <p className="text-sm text-ink-2">
        一條龍管理：待審素材逐筆入庫 → 素材庫「再排一篇」→ 草稿審核 → 排程發布。每欄卡片上的按鈕即是下一步動作。
      </p>
      <PipelineBoard
        pending={pending}
        materials={materials}
        itemRev={itemRev}
        drafts={drafts}
        accounts={accounts}
        accountMeta={accountMeta}
        defaultAccount={defaultAccount}
        sponsor={{ enabled: sponsorEnabled, pickByAccount }}
        publishPlan={publishPlan}
        cloud={cc?.cloud ?? null}
        preset={cc?.preset ?? null}
      />
    </div>
  );
}
