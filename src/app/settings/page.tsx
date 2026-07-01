import {
  getCopyPrefs,
  getPublishPrefs,
  getNotifyPrefs,
  getRepostLimits,
  getUserTelegramChatId,
  getDisplayName,
  getDefaultShareMaterials,
  getFeatureFlags
} from "@/lib/store";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSponsorConfig, countSponsorToday, getSponsorOptOutUntil, listSponsorRecordsForOwner, taipeiParts } from "@/lib/sponsor";
import { listThreadsAccounts } from "@/lib/accounts-store";
import SponsorOptOutForm, { type SponsorAccountRow } from "@/components/SponsorOptOutForm";
import MySponsorPostsCard, { type MySponsorPostRow } from "@/components/MySponsorPostsCard";
import { env, isDemoMode } from "@/lib/env";
import CopyPrefsForm from "@/components/CopyPrefsForm";
import { buildCopyPromptPreview } from "@/services/ai/humanizer";
import PublishPrefsForm from "@/components/PublishPrefsForm";
import RepostLimitsForm from "@/components/RepostLimitsForm";
import NotifyPrefsForm from "@/components/NotifyPrefsForm";
import PushToggle from "@/components/PushToggle";
import TelegramForm from "@/components/TelegramForm";
import DisplayNameForm from "@/components/DisplayNameForm";
import TelegramWebhookSetup from "@/components/TelegramWebhookSetup";
import SponsorConfigForm from "@/components/SponsorConfigForm";
import DefaultShareForm from "@/components/DefaultShareForm";

export const dynamic = "force-dynamic";

// 設定：行為偏好（發文節奏、重發上限、文案）與通知（Telegram/推播/事件）。帳號與金鑰綁定在「帳號管理」。
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  const [copyPrefs, publishPrefs, repostLimits, notifyPrefs, telegramChatId, sponsor, displayName, defaultShare, flags] =
    await Promise.all([
      getCopyPrefs(user.id),
      getPublishPrefs(user.id),
      getRepostLimits(user.id),
      getNotifyPrefs(user.id),
      getUserTelegramChatId(user.id),
      getSponsorConfig(),
      getDisplayName(user.id).catch(() => null),
      getDefaultShareMaterials(user.id).catch(() => true),
      getFeatureFlags().catch(() => null)
    ]);
  const telegramBound = Boolean(telegramChatId);

  // 贊助文透明化（非 owner 且已啟用）：各帳號今日已當贊助文篇數＋臨時禁用狀態，以及完整贊助文紀錄。
  let sponsorAccounts: SponsorAccountRow[] = [];
  let mySponsorPosts: MySponsorPostRow[] = [];
  if (sponsor.enabled && !user.isOwner && !isDemoMode) {
    const today = taipeiParts().date;
    const accts = await listThreadsAccounts(user.id).catch(() => []);
    sponsorAccounts = await Promise.all(
      accts.map(async (a) => ({
        id: a.id,
        label: a.label,
        usedToday: await countSponsorToday(a.id, today).catch(() => 0),
        optOutUntil: await getSponsorOptOutUntil(a.id).catch(() => null)
      }))
    );
    const labelById = new Map(accts.map((a) => [a.id, a.label]));
    const records = await listSponsorRecordsForOwner(user.id, 50).catch(() => []);
    mySponsorPosts = records.map((e) => {
      const rec = e.rec;
      const status = rec.ownLink
        ? { label: "自賺（自己連結）", tone: "text-ink-3" }
        : rec.deleted
          ? { label: "已下架（不計違規）", tone: "text-ink-3" }
          : rec.violated
            ? { label: "連結被移除/竄改", tone: "text-red-600" }
            : rec.verified
              ? { label: "已驗證", tone: "text-green-600" }
              : { label: "待驗證", tone: "text-amber-600" };
      return {
        accountLabel: labelById.get(e.accountId) ?? e.accountId,
        postId: rec.postId,
        link: rec.link,
        atText: new Date(rec.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short" }),
        statusLabel: status.label,
        statusTone: status.tone
      };
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-ink-2">發文節奏、重發上限、文案風格與各種通知都在這裡。連接帳號與綁定金鑰請到 <Link href="/accounts" className="text-brand underline">帳號管理</Link>。</p>
      </div>

      {/* 卡片依實用度排序：發文策略（每天最影響成效）→ 文案風格 → 會員暱稱 → 通知群（多為一次性設定）→ 管理員專屬。 */}
      {(publishPrefs || repostLimits) && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-ink-2">發文策略（節奏與重發上限）</h2>
          {publishPrefs && <PublishPrefsForm initial={publishPrefs} />}
          {repostLimits && <RepostLimitsForm initial={repostLimits} />}
        </section>
      )}

      <CopyPrefsForm initial={copyPrefs} />

      {/* 共享庫開放時才顯示「新素材預設分享」開關（否則設定無意義）。 */}
      {flags?.shared && <DefaultShareForm initial={defaultShare} />}

      <DisplayNameForm initial={displayName} />

      <div id="setup-notify" className="scroll-mt-24 space-y-4">
        <TelegramForm bound={telegramBound} botConfigured={!isDemoMode && Boolean(env.telegramBotToken)} />
        {user.isPlatformOwner && !isDemoMode && Boolean(env.telegramBotToken) && <TelegramWebhookSetup />}
      </div>

      {env.vapidPublicKey && <PushToggle vapidPublicKey={env.vapidPublicKey} />}

      {notifyPrefs && <NotifyPrefsForm initial={notifyPrefs} />}

      {user.isOwner && (
        <details className="card p-5">
          <summary className="cursor-pointer font-semibold">預覽 AI 文案 prompt（管理員）</summary>
          <p className="mt-2 text-xs text-ink-3">
            用你目前儲存的文案偏好組出、實際送進模型的系統 prompt（範例商品）。改偏好並儲存後重新整理即更新。
          </p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-ink-2" translate="no">
            {buildCopyPromptPreview(copyPrefs)}
          </pre>
        </details>
      )}

      {user.isOwner && <SponsorConfigForm initial={sponsor} />}

      {!user.isOwner && sponsor.enabled && <SponsorOptOutForm accounts={sponsorAccounts} />}
      {!user.isOwner && sponsor.enabled && <MySponsorPostsCard rows={mySponsorPosts} />}
    </div>
  );
}
