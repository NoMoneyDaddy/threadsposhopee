import {
  listShopeeAccounts,
  listThreadsAccounts,
  hasApifyCredentials,
  hasGeminiKey,
  getShopeeAffiliateId,
  getShopeeSubId,
  getAutoReviveLinks,
  getUserCloudinary,
  getUserCloudinaryFull,
  getUserR2
} from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { getThreadsAccountLimit } from "@/lib/account-limits";
import { isDemoMode } from "@/lib/env";
import { tokenExpiryState } from "@/lib/token-expiry";
import ThreadsAccountForm from "@/components/ThreadsAccountForm";
import ShopeeAccountForm from "@/components/ShopeeAccountForm";
import ApifyForm from "@/components/ApifyForm";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import GeminiForm from "@/components/GeminiForm";
import AffiliateIdForm from "@/components/AffiliateIdForm";
import SubIdForm from "@/components/SubIdForm";
import AutoReviveForm from "@/components/AutoReviveForm";
import SelfBuyNotice from "@/components/SelfBuyNotice";
import CloudinaryForm from "@/components/CloudinaryForm";
import R2Form from "@/components/R2Form";
import MediaHostCompare from "@/components/MediaHostCompare";
import RenameAccountButton from "@/components/RenameAccountButton";
import { DeleteButton, ToggleButton } from "@/components/RowActions";

export const dynamic = "force-dynamic";

// 帳號管理：只放「帳號連接＋金鑰／憑證綁定」。行為偏好與通知設定在「設定」頁。
export default async function AccountsPage() {
  const user = await getCurrentUser();
  // 未登入（且非 demo）不可用 demo-user 當後備查資料（service-role 僅以 owner_id 過濾，後備 id 會變存取金鑰）。
  if (!user && !isDemoMode) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">請先登入。</div>;
  }
  const ownerId = user?.id ?? "demo-user";
  const [threads, shopee] = await Promise.all([listThreadsAccounts(ownerId), listShopeeAccounts(ownerId)]);
  const [apify, geminiBound, affiliateId, customSubId, autoRevive, cloudinary, cloudinaryFull, r2Settings] =
    await Promise.all([
      user ? hasApifyCredentials(ownerId) : Promise.resolve({ bound: false, actor: null }),
      user ? hasGeminiKey(user.id) : Promise.resolve(false),
      getShopeeAffiliateId(ownerId),
      user ? getShopeeSubId(ownerId) : Promise.resolve(null),
      user ? getAutoReviveLinks(ownerId) : Promise.resolve(false),
      user ? getUserCloudinary(ownerId) : Promise.resolve(null),
      user ? getUserCloudinaryFull(ownerId) : Promise.resolve(null),
      user ? getUserR2(ownerId) : Promise.resolve(null)
    ]);
  // 只把非機密欄位帶回表單初始值（accountId/bucket/publicBase）；金鑰留在 server 不外露。
  const r2Bound = Boolean(r2Settings);
  // 帳號上限（本站不收費、無方案）：與後端 canAddThreadsAccount 共用同一 helper，避免規則脫鉤。
  const accountLimit = getThreadsAccountLimit(user?.isOwner);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">帳號管理</h1>
        <p className="text-sm text-ink-2">連接你的發文帳號、綁定各服務金鑰。發文節奏、通知等偏好請到「設定」。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div id="setup-threads" className="scroll-mt-24">
          <ThreadsAccountForm />
        </div>
        <div id="setup-shopee" className="scroll-mt-24">
          <ShopeeAccountForm bound={shopee[0] ?? null} />
        </div>
      </div>

      {user && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <AffiliateIdForm initial={affiliateId} />
            <SubIdForm initial={customSubId} />
            <AutoReviveForm initial={autoRevive} />
          </div>
          <SelfBuyNotice />
        </>
      )}

      {user && (
        <div id="setup-media" className="scroll-mt-24 space-y-4">
          <MediaHostCompare />
          <R2Form
            bound={r2Bound}
            initialAccountId={r2Settings?.accountId ?? ""}
            initialBucket={r2Settings?.bucket ?? ""}
            initialPublicBase={r2Settings?.publicBase ?? ""}
          />
          <CloudinaryForm
            initialCloud={cloudinary?.cloud ?? null}
            initialPreset={cloudinary?.preset ?? null}
            hasApiKey={Boolean(cloudinaryFull)}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* 抓取：綁定自己的 Apify 金鑰即可用；AI 文案每人各綁各的 */}
        {user && (
          <div id="setup-apify" className="scroll-mt-24">
            <ApifyForm bound={apify.bound} />
          </div>
        )}
        {user && (
          <div id="setup-gemini" className="scroll-mt-24">
            <GeminiForm bound={geminiBound} />
          </div>
        )}
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Threads 發文帳號</h2>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-2">
            {user?.isOwner
              ? `${threads.length} / ${accountLimit} 個（管理者）`
              : `${threads.length} / ${accountLimit} 個發文帳號`}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {threads.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {a.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm text-ink-2">
                      {(a.label || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.label}</div>
                    {a.display_name && <div className="truncate text-xs text-ink-3">{a.display_name}</div>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-ink-2">{a.status}</span>
              </div>
              <div className="mt-1 text-sm text-ink-2">Threads ID：{a.threads_user_id}</div>
              {a.token_expires_at && (() => {
                const exp = tokenExpiryState(a.token_expires_at);
                if (exp.level === "unknown")
                  return <div className="text-xs font-medium text-ink-2">⚠️ 帳號授權到期日格式異常，請重新貼上 token</div>;
                const date = new Date(a.token_expires_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
                if (exp.level === "expired")
                  return <div className="text-xs font-medium text-red-600">⚠️ 帳號授權已過期（{date}）— 請重新貼上 token</div>;
                if (exp.level === "soon")
                  return <div className="text-xs font-medium text-amber-600">⏳ 帳號授權將在 {exp.daysLeft} 天後到期（{date}）— 系統會在到期前自動嘗試更新；若授權失效會通知你並停止排程</div>;
                return <div className="text-xs text-ink-3">✅ 帳號授權有效（至 {date}，系統會定期自動嘗試更新）</div>;
              })()}
              <div className="mt-2 flex items-center gap-3 border-t pt-2">
                {a.status === "paused" ? (
                  <ToggleButton endpoint={`/api/accounts/threads/${a.id}`} body={{ status: "active" }} label="▶ 恢復排程" />
                ) : (
                  <ToggleButton endpoint={`/api/accounts/threads/${a.id}`} body={{ status: "paused" }} label="⏸ 暫停排程" />
                )}
                <RenameAccountButton endpoint={`/api/accounts/threads/${a.id}`} current={a.label} />
                <DeleteButton endpoint={`/api/accounts/threads/${a.id}`} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm text-ink-3">
        🔒 你綁定的所有金鑰／權杖（Threads／Shopee／Gemini／Apify／Cloudinary／R2）皆以 AES-256-GCM 加密、僅在伺服器使用，
        只用於你自己的帳號、永不分享或外露給其他使用者；前端不會回傳明文。
      </p>

      {user && !isDemoMode && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-red-600">危險區</h2>
          <DeleteAccountButton />
        </section>
      )}
    </div>
  );
}
