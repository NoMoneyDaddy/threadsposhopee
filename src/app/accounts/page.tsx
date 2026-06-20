import {
  listShopeeAccounts,
  listThreadsAccounts,
  hasApifyCredentials,
  hasGeminiKey,
  getCopyPrefs,
  getShopeeAffiliateId,
  getUserCloudinary,
  getUserTelegramChatId,
  getUserDiscordWebhook,
  getUserPlan
} from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { PLAN_LABELS, planLimits } from "@/lib/plans";
import { env, isDemoMode } from "@/lib/env";
import { tokenExpiryState } from "@/lib/token-expiry";
import ThreadsAccountForm from "@/components/ThreadsAccountForm";
import ShopeeAccountForm from "@/components/ShopeeAccountForm";
import ApifyForm from "@/components/ApifyForm";
import GeminiForm from "@/components/GeminiForm";
import CopyPrefsForm from "@/components/CopyPrefsForm";
import AffiliateIdForm from "@/components/AffiliateIdForm";
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
  // 爬蟲（Apify）owner 限定；AI（Gemini）每人各綁各的
  const apify = user?.isOwner ? await hasApifyCredentials(ownerId) : { bound: false, actor: null };
  const geminiBound = user ? await hasGeminiKey(user.id) : false;
  const copyPrefs = await getCopyPrefs(ownerId);
  const affiliateId = await getShopeeAffiliateId(ownerId);
  const cloudinary = user ? await getUserCloudinary(ownerId) : null;
  const telegramBound = user ? Boolean(await getUserTelegramChatId(user.id)) : false;
  const discordBound = user ? Boolean(await getUserDiscordWebhook(user.id)) : false;
  // 方案配額（owner 不受限，顯示「無上限」）
  const plan = user ? await getUserPlan(user.id) : "free";
  const accountLimit = planLimits(plan).maxThreadsAccounts;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">帳號管理</h1>

      {searchParams.threads && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            searchParams.threads === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {searchParams.threads === "ok" ? "✅ " : "❌ "}
          {searchParams.note ?? (searchParams.threads === "ok" ? "已連結 Threads 帳號" : "連結失敗")}
        </div>
      )}

      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">用 Threads 一鍵連結發文帳號</div>
            <p className="text-sm text-neutral-500">免手貼 token，授權後自動換 60 天長期憑證並自動展期。</p>
          </div>
          {oauthReady ? (
            <a
              href="/api/auth/threads/start"
              className="shrink-0 rounded-md bg-shopee px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              用 Threads 連結帳號
            </a>
          ) : (
            <span className="shrink-0 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
              尚未設定 Threads App
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ThreadsAccountForm />
        <ShopeeAccountForm />
      </div>

      {user && <AffiliateIdForm initial={affiliateId} />}

      {user && <CloudinaryForm initialCloud={cloudinary?.cloud ?? null} initialPreset={cloudinary?.preset ?? null} />}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 爬蟲僅 owner；AI 文案每人各綁各的 */}
        {user?.isOwner && <ApifyForm bound={apify.bound} actor={apify.actor} />}
        {user && <GeminiForm bound={geminiBound} />}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {user && <TelegramForm bound={telegramBound} botConfigured={!isDemoMode && Boolean(env.telegramBotToken)} />}
        {user && <DiscordForm bound={discordBound} />}
      </div>

      <CopyPrefsForm initial={copyPrefs} />

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Threads 發文帳號</h2>
          <span className="rounded-full bg-shopee/10 px-3 py-1 text-xs text-shopee" title="可連結的發文帳號數，依方案而定">
            {PLAN_LABELS[plan]}方案 ·{" "}
            {user?.isOwner ? `${threads.length} 個（管理者無上限）` : `${threads.length} / ${accountLimit} 個發文帳號`}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {threads.map((a) => (
            <div key={a.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-neutral-500">{a.status}</span>
              </div>
              <div className="mt-1 text-sm text-neutral-500">user id: {a.threads_user_id}</div>
              {a.token_expires_at && (() => {
                const exp = tokenExpiryState(a.token_expires_at);
                if (exp.level === "unknown")
                  return <div className="text-xs font-medium text-neutral-500">⚠️ token 到期日格式異常，請重新授權</div>;
                const date = new Date(a.token_expires_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
                if (exp.level === "expired")
                  return <div className="text-xs font-medium text-red-600">⚠️ token 已過期（{date}）— 請重新授權</div>;
                if (exp.level === "soon")
                  return <div className="text-xs font-medium text-amber-600">⏳ token {exp.daysLeft} 天後到期（{date}）— 自動展期中，若仍失敗請重新授權</div>;
                return <div className="text-xs text-neutral-400">token 到期：{date}（自動展期）</div>;
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
            <div key={a.id} className="rounded-lg border bg-white p-4">
              <div className="font-medium">{a.label}</div>
              <div className="mt-1 text-sm text-neutral-500">app id: {a.app_id}</div>
              <div className="text-sm text-neutral-500">預設 subId: {a.default_sub_id}</div>
              <div className="mt-2 border-t pt-2">
                <DeleteButton endpoint={`/api/accounts/shopee/${a.id}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm text-neutral-400">
        🔒 access token / secret 以 AES-256-GCM 加密存放，前端不會回傳明文。
      </p>
    </div>
  );
}
