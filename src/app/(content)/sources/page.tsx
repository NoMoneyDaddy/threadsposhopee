import { listShopeeAccounts, listSources, listThreadsAccounts, hasApifyCredentials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import SourceForm from "@/components/SourceForm";
import { DeleteButton, ToggleButton } from "@/components/RowActions";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await getCurrentUser();
  // 未登入（且非 demo）不可用 demo-user 當後備查資料（service-role 僅以 owner_id 過濾，後備 id 會變存取金鑰）。
  if (!user && !isDemoMode) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">請先登入。</div>;
  }
  const ownerId = user?.id ?? "demo-user";

  // 抓取：綁定自己的 Apify 金鑰即可使用（計費算在自己帳上）。未綁先引導去綁。
  // demo 模式（無金鑰）照常顯示頁面，方便試用與 e2e 煙霧測試。
  const apify = isDemoMode ? { bound: true } : await hasApifyCredentials(ownerId);
  if (!apify.bound && !isDemoMode) {
    return (
      <div className="space-y-3 rounded-2xl border border-dashed p-10 text-center text-ink-2">
        <p>自動抓文需要你自己的 Apify 金鑰（抓取靠它，費用也算在你的 Apify 帳號）。</p>
        <p>
          <a href="/accounts#setup-apify" className="text-brand underline">
            前往帳號管理綁定 Apify 金鑰 →
          </a>
        </p>
        <p className="text-xs text-ink-3">
          Apify 免費帳號每月約 US$5 平台額度；本工具使用的 actor「igview-owner/threads-search-scraper」計費約
          US$5 / 每 1,000 筆結果起（以 Apify 商店頁為準）。
        </p>
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
                  {s.auto_publish ? (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-700">免審直發</span>
                  ) : (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-600">進審核佇列</span>
                  )}
                </td>
                <td className="px-4 py-2">{s.enabled ? "✅ 啟用" : "⏸ 停用"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <ToggleButton
                      endpoint={`/api/sources/${s.id}`}
                      body={{ enabled: !s.enabled }}
                      label={s.enabled ? "⏸ 停用" : "▶ 啟用"}
                    />
                    <ToggleButton
                      endpoint={`/api/sources/${s.id}`}
                      body={{ auto_publish: !s.auto_publish }}
                      label={s.auto_publish ? "改回待審" : "改免審直發"}
                      confirm={
                        s.auto_publish
                          ? undefined
                          : "開啟「免審直接排程」後，此來源抓到的內容會自動發文、不經人工審核。確定開啟？"
                      }
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
