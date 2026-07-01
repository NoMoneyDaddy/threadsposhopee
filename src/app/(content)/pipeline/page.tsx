import PipelineBoard from "@/components/PipelineBoard";
import AccountsOverview, { type AccountOverviewRow } from "@/components/AccountsOverview";
import { listDrafts, listMaterials, listPendingMaterials, listThreadsAccounts, getPublishPlan, getFeatureFlags, getDefaultShareMaterials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { taipeiDateStr } from "@/lib/streak";
import { isDemoMode } from "@/lib/env";
import { getMediaProvider } from "@/services/media/upload";
import { getSponsorConfig, getSponsorPickMap, listSponsorRecordsForOwner } from "@/lib/sponsor";
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
    // getPublishPlan/listApprovedDraftsForPlan/getAccountPublishState 皆已支援 demo，故 demo 也載入。
    user || isDemoMode ? getPublishPlan(ownerId).catch(() => []) : Promise.resolve([])
  ]);
  const cc = provider.kind === "cloudinary" ? provider.creds : null;
  const publishPlan = Object.fromEntries(plan.map((r) => [r.id, { etaIso: r.etaIso, reason: r.reason }]));

  // 帳號總覽（多帳號才顯示）：各帳號待審／已排／今日已發 + 下一篇預計時間。
  const today = taipeiDateStr(Date.now());
  const accountsOverview: AccountOverviewRow[] = accounts.map((a) => {
    const mine = drafts.filter((d) => d.threads_account_id === a.id);
    const nextEtaIso =
      mine
        .filter((d) => d.status === "approved")
        .map((d) => publishPlan[d.id]?.etaIso)
        .filter((x): x is string => Boolean(x))
        .sort((x, y) => x.localeCompare(y))[0] ?? null;
    return {
      id: a.id,
      label: a.label,
      displayName: a.display_name ?? null,
      pending: mine.filter((d) => d.status === "draft").length,
      approved: mine.filter((d) => d.status === "approved").length,
      publishedToday: mine.filter((d) => d.status === "published" && d.published_at && taipeiDateStr(Date.parse(d.published_at)) === today).length,
      nextEtaIso
    };
  });

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

  // 共享庫是否開放：開放才在待審素材顯示「入庫並分享」。開放時再讀「新素材預設分享」設定。
  const flags = user ? await getFeatureFlags().catch(() => null) : null;
  const defaultShare = user && flags?.shared ? await getDefaultShareMaterials(user.id).catch(() => true) : false;
  // 已實際成為贊助文的貼文（供已發布草稿卡標記）；owner 帳號不適用贊助文，通常為空。
  const sponsoredPostIds =
    user && sponsorEnabled ? (await listSponsorRecordsForOwner(user.id).catch(() => [])).map((e) => e.rec.postId) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">工作台</h1>
      </div>
      <p className="text-sm text-ink-2">
        一條龍管理：待審素材逐筆入庫 → 素材庫「再排一篇」→ 草稿審核 → 排程發布。每欄卡片上的按鈕即是下一步動作。
      </p>
      <AccountsOverview rows={accountsOverview} />
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
        canShare={Boolean(flags?.shared)}
        defaultShare={defaultShare}
        sponsoredPostIds={sponsoredPostIds}
      />
    </div>
  );
}
