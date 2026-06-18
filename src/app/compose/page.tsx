import ComposerForm from "@/components/ComposerForm";
import { listThreadsAccounts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const user = await getCurrentUser();
  const accounts = await listThreadsAccounts(user?.id ?? "demo-user");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">快速發文</h1>
        <p className="text-sm text-neutral-500">貼一個蝦皮連結 → AI 生成文案 → 編輯後立即發布、排程或存草稿。</p>
      </div>
      {accounts.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          還沒有發文帳號。可先到「帳號管理」新增 Threads 帳號，或先「存草稿」之後再發。
        </div>
      )}
      <ComposerForm threadsAccounts={accounts} />
    </div>
  );
}
