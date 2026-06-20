import BulkDraftBar from "@/components/BulkDraftBar";
import DraftsExplorer from "@/components/DraftsExplorer";
import { listDrafts, listThreadsAccounts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const user = await getCurrentUser();
  const ownerId = user?.id ?? "demo-user";
  const [drafts, accounts] = await Promise.all([listDrafts(ownerId), listThreadsAccounts(ownerId)]);
  const pendingIds = drafts.filter((d) => d.status === "draft").map((d) => d.id);
  // 帳號 id → 標籤：多帳號時草稿卡顯示「要發到哪個帳號」
  const accountLabels = Object.fromEntries(accounts.map((a) => [a.id, a.label]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">文案佇列</h1>
      <p className="text-sm text-neutral-500">
        AI 生成的草稿在此審核。可直接編輯文案、AI 重寫、核准發布或刪除。分潤連結會自動放留言區。
      </p>

      <BulkDraftBar draftIds={pendingIds} />
      <DraftsExplorer drafts={drafts} accountLabels={accountLabels} />
    </div>
  );
}
