import DraftCard from "@/components/DraftCard";
import { listDrafts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const user = await getCurrentUser();
  const drafts = await listDrafts(user?.id ?? "demo-user");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">文案佇列</h1>
      <p className="text-sm text-neutral-500">
        AI 生成的草稿在此審核。可直接編輯文案、AI 重寫、核准發布或刪除。分潤連結會自動放留言區。
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {drafts.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
        {drafts.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed p-10 text-center text-neutral-400">
            還沒有草稿。到「素材庫」建立內容，或（管理者）回儀表板按「立即跑一次」。
          </div>
        )}
      </div>
    </div>
  );
}
