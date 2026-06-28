import SelfComposeForm from "@/components/SelfComposeForm";
import { listThreadsAccounts } from "@/lib/store";
import { getMediaProvider } from "@/services/media/upload";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl p-4 text-center text-sm text-red-500">請先登入以使用快速發文功能。</div>
    );
  }
  const accounts = await listThreadsAccounts(user.id);
  // 本機上傳的圖床選擇與 server 端 getMediaProvider 一致（R2 優先）：
  // 只有 Cloudinary 為實際生效圖床時才給 cloud/preset 走瀏覽器直傳；綁了 R2 則留空 → 走 /api/media/upload。
  const provider = await getMediaProvider(user.id);
  const cc = provider.kind === "cloudinary" ? provider.creds : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">發文</h1>
          <p className="text-sm text-ink-2">
            像 Threads 一樣：直接打字、上傳多張照片／影片，右側即時預覽所見即所得。
          </p>
        </div>
        <a href="/materials" className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-surface-2">
          管理素材
        </a>
      </div>
      {accounts.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          還沒有發文帳號。請先到「帳號管理」新增 Threads 帳號（發布、排程與存草稿都需要選擇發文帳號）。
        </div>
      )}
      <SelfComposeForm threadsAccounts={accounts} cloud={cc?.cloud ?? null} preset={cc?.preset ?? null} />
    </div>
  );
}
