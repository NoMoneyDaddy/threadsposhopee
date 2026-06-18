import { listShopeeAccounts, listThreadsAccounts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import ThreadsAccountForm from "@/components/ThreadsAccountForm";
import ShopeeAccountForm from "@/components/ShopeeAccountForm";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [threads, shopee] = await Promise.all([listThreadsAccounts(ownerId), listShopeeAccounts(ownerId)]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">帳號管理</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <ThreadsAccountForm />
        <ShopeeAccountForm />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Threads 發文帳號</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {threads.map((a) => (
            <div key={a.id} className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{a.label}</span>
                <span className="text-xs text-neutral-500">{a.status}</span>
              </div>
              <div className="mt-1 text-sm text-neutral-500">user id: {a.threads_user_id}</div>
              {a.token_expires_at && (
                <div className="text-xs text-neutral-400">
                  token 到期：{new Date(a.token_expires_at).toLocaleDateString("zh-TW")}（自動展期）
                </div>
              )}
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
