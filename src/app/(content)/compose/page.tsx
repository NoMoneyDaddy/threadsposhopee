import ComposerForm from "@/components/ComposerForm";
import SelfComposeForm from "@/components/SelfComposeForm";
import { listThreadsAccounts, getUserCloudinary } from "@/lib/store";
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
  // 本機上傳用的 Cloudinary：一律用「使用者自綁的」，無系統 fallback；沒綁則隱藏上傳鈕並導去綁定。
  const ownCloud = await getUserCloudinary(user.id);
  const cc = ownCloud?.cloud && ownCloud?.preset ? ownCloud : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">發文</h1>
          <p className="text-sm text-ink-2">貼一個蝦皮連結 → AI 生成文案 → 編輯後立即發布、排程或存草稿。</p>
        </div>
        <a href="/materials" className="shrink-0 rounded-xl border px-3 py-2 text-sm hover:bg-surface-2">
          管理素材
        </a>
      </div>
      {accounts.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          還沒有發文帳號。可先到「帳號管理」新增 Threads 帳號，或先「存草稿」之後再發。
        </div>
      )}
      <ComposerForm threadsAccounts={accounts} cloud={cc?.cloud ?? null} preset={cc?.preset ?? null} />

      <div className="pt-2">
        <h2 className="mb-1 text-lg font-semibold">自寫一則直推</h2>
        <p className="mb-2 text-sm text-ink-2">像 Threads 一樣：直接打字、上傳照片／影片，右側即時預覽所見即所得；貼文中的網址會自動變成可點連結。</p>
        <SelfComposeForm threadsAccounts={accounts} cloud={cc?.cloud ?? null} preset={cc?.preset ?? null} />
      </div>

    </div>
  );
}
