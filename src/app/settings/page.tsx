import {
  getCopyPrefs,
  getPublishPrefs,
  getNotifyPrefs,
  getRepostLimits,
  getUserTelegramChatId
} from "@/lib/store";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSponsorConfig } from "@/lib/sponsor";
import { env, isDemoMode } from "@/lib/env";
import CopyPrefsForm from "@/components/CopyPrefsForm";
import { buildCopyPromptPreview } from "@/services/ai/humanizer";
import PublishPrefsForm from "@/components/PublishPrefsForm";
import RepostLimitsForm from "@/components/RepostLimitsForm";
import NotifyPrefsForm from "@/components/NotifyPrefsForm";
import PushToggle from "@/components/PushToggle";
import TelegramForm from "@/components/TelegramForm";
import TelegramWebhookSetup from "@/components/TelegramWebhookSetup";
import SponsorConfigForm from "@/components/SponsorConfigForm";

export const dynamic = "force-dynamic";

// 設定：行為偏好（發文節奏、重發上限、文案）與通知（Telegram/推播/事件）。帳號與金鑰綁定在「帳號管理」。
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  const [copyPrefs, publishPrefs, repostLimits, notifyPrefs, telegramChatId, sponsor] =
    await Promise.all([
      getCopyPrefs(user.id),
      getPublishPrefs(user.id),
      getRepostLimits(user.id),
      getNotifyPrefs(user.id),
      getUserTelegramChatId(user.id),
      getSponsorConfig()
    ]);
  const telegramBound = Boolean(telegramChatId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-ink-2">發文節奏、重發上限、文案風格與各種通知都在這裡。</p>
      </div>

      <div id="setup-notify" className="scroll-mt-24 space-y-4">
        <TelegramForm bound={telegramBound} botConfigured={!isDemoMode && Boolean(env.telegramBotToken)} />
        {user.isPlatformOwner && !isDemoMode && Boolean(env.telegramBotToken) && <TelegramWebhookSetup />}
      </div>

      {env.vapidPublicKey && <PushToggle vapidPublicKey={env.vapidPublicKey} />}

      {notifyPrefs && <NotifyPrefsForm initial={notifyPrefs} />}

      {publishPrefs && <PublishPrefsForm initial={publishPrefs} />}

      {repostLimits && <RepostLimitsForm initial={repostLimits} />}

      <CopyPrefsForm initial={copyPrefs} />

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

      {!user.isOwner && sponsor.enabled && (
        <div className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-ink-2">
          ℹ️ 免費使用：你的每個發文帳號每天會有 1 篇於冷門時段（{sponsor.offPeakStart}–{sponsor.offPeakEnd} 時）以平台分潤連結發布，
          系統會事前標示、發後還原你的連結。詳見{" "}
          <Link href="/sponsored" className="text-brand underline">《贊助文規則》</Link>。
        </div>
      )}
    </div>
  );
}
