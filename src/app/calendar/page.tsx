import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listDrafts, listThreadsAccounts } from "@/lib/store";
import CalendarView, { type CalItem } from "@/components/CalendarView";

export const dynamic = "force-dynamic";

// 內容行事曆：把「已排程／已發布」貼文以月曆呈現（對標 Buffer／Loomly）。
// 唯讀視覺化；改時間仍在草稿頁逐則操作（避免重複實作排程邏輯）。
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const [drafts, accounts] = await Promise.all([
    listDrafts(user.id).catch(() => []),
    listThreadsAccounts(user.id).catch(() => [])
  ]);
  const labels = Object.fromEntries(accounts.map((a) => [a.id, a.label]));

  // 取有時間定位的貼文：已排程（approved + scheduled_at）或已發布（published_at 優先，否則 scheduled_at）。
  const items: CalItem[] = drafts.flatMap((d) => {
    const iso = d.status === "published" ? d.published_at ?? d.scheduled_at : d.scheduled_at;
    if (!iso) return [];
    return [
      {
        id: d.id,
        iso,
        title: d.product_name || (d.main_text ?? "").slice(0, 24) || "（無標題）",
        status: d.status,
        accountLabel: d.threads_account_id ? labels[d.threads_account_id] ?? null : null
      }
    ];
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">內容行事曆</h1>
          <p className="text-sm text-ink-2">已排程與已發布的貼文一覽。要改時間或審核，請到草稿頁。</p>
        </div>
        <Link href="/drafts" className="btn btn-outline btn-sm">回草稿管理</Link>
      </div>
      <CalendarView items={items} />
    </div>
  );
}
