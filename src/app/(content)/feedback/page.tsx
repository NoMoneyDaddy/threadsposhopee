import { getCurrentUser, listAllUsers } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { listFeedbackForOwner, listAllFeedback } from "@/lib/feedback-store";
import FeedbackForm from "@/components/FeedbackForm";
import FeedbackAdminReply from "@/components/FeedbackAdminReply";
import type { Feedback, FeedbackStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已關閉"
};
const STATUS_STYLE: Record<FeedbackStatus, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600"
};

function fmt(ts?: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user && !isDemoMode) {
    return <div className="rounded-2xl border border-dashed p-10 text-center text-ink-2">請先登入以提交意見回饋。</div>;
  }
  const isOwner = Boolean(user?.isOwner);
  const items = isOwner ? await listAllFeedback() : await listFeedbackForOwner(user?.id ?? "demo-user");

  // 管理員視角：附上送出者 email 方便辨識（一般成員看不到他人工單，不需要）。
  let emailOf: Record<string, string> = {};
  if (isOwner && !isDemoMode) {
    const users = await listAllUsers().catch(() => []);
    emailOf = Object.fromEntries(users.map((u) => [u.id, u.email ?? u.id]));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">意見回饋</h1>
        <p className="text-sm text-ink-2">
          有功能建議或遇到問題？在這裡提出工單，{isOwner ? "你可在下方直接回覆使用者。" : "我們會在這裡回覆你。"}
        </p>
      </div>

      <FeedbackForm />

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{isOwner ? "所有工單" : "我的工單"}</h2>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-ink-3">目前沒有工單。</div>
        ) : (
          items.map((item: Feedback) => (
            <div key={item.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{item.kind === "bug" ? "🐞" : "💡"}</span>
                <span className="font-medium">{item.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
                <span className="ml-auto text-xs text-ink-3">{fmt(item.created_at)}</span>
              </div>
              {isOwner && (
                <p className="mt-1 text-xs text-ink-3">送出者：{emailOf[item.owner_id] ?? item.owner_id}</p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{item.message}</p>

              {item.admin_reply && (
                <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
                  <p className="mb-1 text-xs font-medium text-ink-3">管理員回覆 · {fmt(item.replied_at)}</p>
                  <p className="whitespace-pre-wrap">{item.admin_reply}</p>
                </div>
              )}

              {isOwner && <FeedbackAdminReply item={item} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
