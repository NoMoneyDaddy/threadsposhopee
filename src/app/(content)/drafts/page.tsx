import Link from "next/link";
import RetryFailedBar from "@/components/RetryFailedBar";
import DraftsExplorer from "@/components/DraftsExplorer";
import { listDrafts, listThreadsAccounts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { getSponsorConfig, getSponsorPickMap } from "@/lib/sponsor";
import { getMediaProvider } from "@/services/media/upload";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [drafts, accounts] = await Promise.all([listDrafts(ownerId), listThreadsAccounts(ownerId)]);
  // 失敗的草稿 → 可一鍵批次重試重排（卡在 publishing 者交給系統自動回收為 failed 後再重試，
  // 避免與發布中的 worker 競態造成重複發文）
  const failedIds = drafts.filter((d) => d.status === "failed").map((d) => d.id);
  // 帳號 id → 身分（標籤/顯示名/頭像）：草稿卡顯示「要發到哪個帳號」＋原生預覽帶真實頭像/暱稱
  const accountMeta = Object.fromEntries(
    accounts.map((a) => [a.id, { label: a.label, displayName: a.display_name ?? null, avatarUrl: a.avatar_url ?? null }])
  );
  // 未指定發文帳號的草稿，預覽退回第一個帳號的頭像/暱稱（避免空灰圈）；無帳號則 undefined。
  const firstAccount = accounts[0];
  const defaultAccount = firstAccount
    ? { label: firstAccount.label, displayName: firstAccount.display_name ?? null, avatarUrl: firstAccount.avatar_url ?? null }
    : undefined;
  // 贊助文：啟用且非 owner 時，草稿頁可標示／自選哪一篇為今日贊助文。
  const sponsorCfg = await getSponsorConfig();
  const sponsorEnabled = sponsorCfg.enabled && !!user && !user.isOwner;
  const pickByAccount = sponsorEnabled ? await getSponsorPickMap(accounts.map((a) => a.id)) : {};
  // 編輯器媒體上傳用：Cloudinary 為實際生效圖床時走瀏覽器直傳，否則留空走 /api/media/upload（與發文/素材一致）。
  const provider = user ? await getMediaProvider(ownerId) : { kind: "none" as const };
  const cc = provider.kind === "cloudinary" ? provider.creds : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">草稿</h1>
        <Link href="/calendar" className="btn btn-outline btn-sm">📅 行事曆檢視</Link>
      </div>
      <p className="text-sm text-ink-2">
        AI 生成的草稿在此審核。可直接編輯文案、AI 重寫、核准發布或刪除。分潤連結會自動放留言區。
      </p>
      {sponsorEnabled && (
        <p className="rounded-2xl border border-border bg-surface-2 p-3 text-xs text-ink-2">
          ★ 贊助文：每天 1 篇將於冷門時段以平台分潤連結發布。可在下方任一篇按「設為今日贊助文」自選；
          未自選則由系統於冷門時段自動挑。詳見 <a href="/sponsored" className="text-brand underline">《贊助文規則》</a>。
        </p>
      )}

      <RetryFailedBar failedIds={failedIds} />
      <DraftsExplorer
        drafts={drafts}
        accountMeta={accountMeta}
        defaultAccount={defaultAccount}
        sponsor={{ enabled: sponsorEnabled, pickByAccount }}
        cloud={cc?.cloud ?? null}
        preset={cc?.preset ?? null}
      />
    </div>
  );
}
