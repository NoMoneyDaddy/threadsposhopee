import {
  listShopeeAccounts,
  listThreadsAccounts,
  hasApifyCredentials,
  hasGeminiKey,
  getCopyPrefs,
  getShopeeAffiliateId,
  getShopeeSubId,
  getAutoReviveLinks,
  getPublishPrefs,
  getNotifyPrefs,
  getRepostLimits,
  getUserCloudinary,
  getUserTelegramChatId,
  getUserDiscordWebhook,
  getUserPlan
} from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { getSponsorConfig } from "@/lib/sponsor";
import SponsorConfigForm from "@/components/SponsorConfigForm";
import { PLAN_LABELS, planLimits, GLOBAL_MAX_THREADS_ACCOUNTS } from "@/lib/plans";
import { env, isDemoMode } from "@/lib/env";
import { tokenExpiryState } from "@/lib/token-expiry";
import ThreadsAccountForm from "@/components/ThreadsAccountForm";
import ShopeeAccountForm from "@/components/ShopeeAccountForm";
import ApifyForm from "@/components/ApifyForm";
import GeminiForm from "@/components/GeminiForm";
import CopyPrefsForm from "@/components/CopyPrefsForm";
import AffiliateIdForm from "@/components/AffiliateIdForm";
import SubIdForm from "@/components/SubIdForm";
import AutoReviveForm from "@/components/AutoReviveForm";
import PublishPrefsForm from "@/components/PublishPrefsForm";
import RepostLimitsForm from "@/components/RepostLimitsForm";
import NotifyPrefsForm from "@/components/NotifyPrefsForm";
import PushToggle from "@/components/PushToggle";
import CloudinaryForm from "@/components/CloudinaryForm";
import TelegramForm from "@/components/TelegramForm";
import DiscordForm from "@/components/DiscordForm";
import { DeleteButton, ToggleButton } from "@/components/RowActions";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams
}: {
  searchParams: { threads?: string; note?: string };
}) {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [threads, shopee] = await Promise.all([listThreadsAccounts(ownerId), listShopeeAccounts(ownerId)]);
  const oauthReady = !isDemoMode && Boolean(env.threadsAppId && env.threadsRedirectUri);
  // 設定值彼此無依賴，改 Promise.all 並行（原為 14 個序列 await 瀑布，高延遲下整頁 TTFB 多耗 1s+）。
  // 爬蟲（Apify）owner 限定；AI（Gemini）每人各綁各的。
  const [
    apify,
    geminiBound,
    copyPrefs,
    affiliateId,
    customSubId,
    autoRevive,
    publishPrefs,
    repostLimits,
    notifyPrefs,
    cloudinary,
    telegramChatId,
    discordWebhook,
    plan,
    sponsor
  ] = await Promise.all([
    user?.isOwner ? hasApifyCredentials(ownerId) : Promise.resolve({ bound: false, actor: null }),
    user ? hasGeminiKey(user.id) : Promise.resolve(false),
    getCopyPrefs(ownerId),
    getShopeeAffiliateId(ownerId),
    user ? getShopeeSubId(ownerId) : Promise.resolve(null),
    user ? getAutoReviveLinks(ownerId) : Promise.resolve(false),
    user ? getPublishPrefs(ownerId) : Promise.resolve(null),
    user ? getRepostLimits(ownerId) : Promise.resolve(null),
    user ? getNotifyPrefs(ownerId) : Promise.resolve(null),
    user ? getUserCloudinary(ownerId) : Promise.resolve(null),
    user ? getUserTelegramChatId(user.id) : Promise.resolve(null),
    user ? getUserDiscordWebhook(user.id) : Promise.resolve(null),
    user ? getUserPlan(user.id) : Promise.resolve("free" as const),
    getSponsorConfig()
  ]);
  const telegramBound = Boolean(telegramChatId);
  const discordBound = Boolean(discordWebhook);
  // 方案配額（owner 不受限，顯示「無上限」）
  const accountLimit = Math.min(planLimits(plan).maxThreadsAccounts, GLOBAL_MAX_THREADS_ACCOUNTS);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">帳號管理</h1>

      {searchParams.threads && (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            searchParams.threads === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {searchParams.threads === "ok" ? "✅ " : "❌ "}
          {searchParams.note ?? (searchParams.threads === "ok" ? "已連結 Threads 帳號" : "連結失敗")}
        </div>
      )}

      <div id="setup-threads" className="scroll-mt-24 rounded-2xl border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">用 Threads 一鍵連結發文帳號</div>
            <p className="text-sm text-ink-2">免手動貼授權碼；連結後系統自動維持有效、到期前自動更新。</p>
          </div>
          {oauthReady ? (
            <a
              href="/api/auth/threads/start"
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              用 Threads 連結帳號
            </a>
          ) : (
            <span className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
              尚未設定 Threads App
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ThreadsAccountForm />
        <div id="setup-shopee" className="scroll-mt-24">
          <ShopeeAccountForm />
        </div>
      </div>

      {user && (
        <div className="grid gap-4 md:grid-cols-2">
          <AffiliateIdForm initial={affiliateId} />
          <SubIdForm initial={customSubId} />
          <AutoReviveForm initial={autoRevive} />
        </div>
      )}

      {user && (
        <div id="setup-cloudinary" className="scroll-mt-24">
          <CloudinaryForm initialCloud={cloudinary?.cloud ?? null} initialPreset={cloudinary?.preset ?? null} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 爬蟲僅 owner；AI 文案每人各綁各的 */}
        {user?.isOwner && (
          <div id="setup-apify" className="scroll-mt-24">
            <ApifyForm bound={apify.bound} actor={apify.actor} />
          </div>
        )}
        {user && (
          <div id="setup-gemini" className="scroll-mt-24">
            <GeminiForm bound={geminiBound} />
          </div>
        )}
      </div>

      <div id="setup-notify" className="grid scroll-mt-24 gap-4 md:grid-cols-2">
        {user && <TelegramForm bound={telegramBound} botConfigured={!isDemoMode && Boolean(env.telegramBotToken)} />}
        {user && <DiscordForm bound={discordBound} />}
      </div>

      {user && env.vapidPublicKey && <PushToggle vapidPublicKey={env.vapidPublicKey} />}

      {user && notifyPrefs && <NotifyPrefsForm initial={notifyPrefs} />}

      {user?.isOwner && <SponsorConfigForm initial={sponsor} />}

      {user && !user.isOwner && sponsor.enabled && (
        <div className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-ink-2">
          ℹ️ 免費使用：你的每個發文帳號每天會有 1 篇於冷門時段（{sponsor.offPeakStart}–{sponsor.offPeakEnd} 時）以平台分潤連結發布，
          系統會事前標示、發後還原你的連結。詳見{" "}
          <a href="/sponsored" className="text-brand underline">《贊助文章規則》</a>。
        </div>
      )}

      {user && publishPrefs && <PublishPrefsForm initial={publishPrefs} />}

      {user && repostLimits && <RepostLimitsForm initial={repostLimits} />}

      <CopyPrefsForm initial={copyPrefs} />

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Threads 發文帳號</h2>
          <a
            href="/pricing"
            className="rounded-full bg-brand/10 px-3 py-1 text-xs text-brand hover:bg-brand/20"
            title="查看方案與升級（可連結的發文帳號數依方案而定）"
          >
            {PLAN_LABELS[plan]}方案 ·{" "}
            {user?.isOwner
              ? `${threads.length} / ${GLOBAL_MAX_THREADS_ACCOUNTS} 個（管理者）`
              : `${threads.length} / ${accountLimit} 個發文帳號`}
          </a>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {threads.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-ink-2">{a.status}</span>
              </div>
              <div className="mt-1 text-sm text-ink-2">user id: {a.threads_user_id}</div>
              {a.token_expires_at && (() => {
                const exp = tokenExpiryState(a.token_expires_at);
                if (exp.level === "unknown")
                  return <div className="text-xs font-medium text-ink-2">⚠️ 授權到期日格式異常，請重新連結帳號</div>;
                const date = new Date(a.token_expires_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
                if (exp.level === "expired")
                  return <div className="text-xs font-medium text-red-600">⚠️ token 已過期（{date}）— 請重新授權</div>;
                if (exp.level === "soon")
                  return <div className="text-xs font-medium text-amber-600">⏳ token {exp.daysLeft} 天後到期（{date}）— 自動展期中，若仍失敗請重新授權</div>;
                return <div className="text-xs text-ink-3">token 到期：{date}（自動展期）</div>;
              })()}
              <div className="mt-2 flex items-center gap-3 border-t pt-2">
                {a.status === "paused" ? (
                  <ToggleButton endpoint={`/api/accounts/threads/${a.id}`} body={{ status: "active" }} label="▶ 恢復排程" />
                ) : (
                  <ToggleButton endpoint={`/api/accounts/threads/${a.id}`} body={{ status: "paused" }} label="⏸ 暫停排程" />
                )}
                <DeleteButton endpoint={`/api/accounts/threads/${a.id}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Shopee 分潤帳號</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {shopee.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-surface p-4">
              <div className="font-medium">{a.label}</div>
              <div className="mt-1 text-sm text-ink-2">app id: {a.app_id}</div>
              <div className="text-sm text-ink-2">預設 subId: {a.default_sub_id}</div>
              <div className="mt-2 border-t pt-2">
                <DeleteButton endpoint={`/api/accounts/shopee/${a.id}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm text-ink-3">
        🔒 access token / secret 以 AES-256-GCM 加密存放，前端不會回傳明文。
      </p>
    </div>
  );
}
