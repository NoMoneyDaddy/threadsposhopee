import { listShopeeAccounts, listSources, listThreadsAccounts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import SourceForm from "@/components/SourceForm";
import { DeleteButton, ToggleButton } from "@/components/RowActions";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";

  // 爬蟲是管理者專屬功能
  if (user && !user.isOwner) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">
        監看來源（抓取）僅限管理者使用。你可以到「素材庫」手動貼分潤連結建立內容。
      </div>
    );
  }

  const [sources, accounts, shopee] = await Promise.all([
    listSources(ownerId),
    listThreadsAccounts(ownerId),
    listShopeeAccounts(ownerId)
  ]);
  const accLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">自動抓文</h1>
      <p className="text-sm text-ink-2">
        每個來源 = 監看一個 Threads 帳號的貼文，自動換成你的分潤連結後產出文案到指定發文帳號。
      </p>

      <SourceForm threadsAccounts={accounts} shopeeAccounts={shopee} />

      <div className="overflow-hidden rounded-2xl border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-ink-2">
            <tr>
              <th className="px-4 py-2">來源帳號</th>
              <th className="px-4 py-2">發文到</th>
              <th className="px-4 py-2">頻率</th>
              <th className="px-4 py-2">模式</th>
              <th className="px-4 py-2">狀態</th>
              <th className="px-4 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2 font-medium">{s.search_query ? `🔍 ${s.search_query}` : `@${s.source_username}`}</td>
                <td className="px-4 py-2">{accLabel(s.threads_account_id)}</td>
                <td className="px-4 py-2">每 {s.poll_interval_minutes} 分</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-600">進審核佇列</span>
                </td>
                <td className="px-4 py-2">{s.enabled ? "✅ 啟用" : "⏸ 停用"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <ToggleButton
                      endpoint={`/api/sources/${s.id}`}
                      body={{ enabled: !s.enabled }}
                      label={s.enabled ? "⏸ 停用" : "▶ 啟用"}
                    />
                    <DeleteButton endpoint={`/api/sources/${s.id}`} />
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                  尚無監看來源。用上方表單新增一個 Threads 帳號來源，系統會定時抓取並產生待審草稿。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
