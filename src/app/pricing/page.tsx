import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getUserPlan } from "@/lib/store";
import { PLANS, PLAN_LABELS, type PlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

// 方案／定價頁：展示級距與各方案解鎖內容，標示目前方案。
// 升級流程（金流串接）待選定金流商後接上；目前 CTA 走聯絡升級。
const ORDER: PlanId[] = ["free", "pro", "business"];

const PRICE: Record<PlanId, string> = {
  free: "NT$0",
  pro: "聯絡我們",
  business: "聯絡我們"
};

const PERKS: Record<PlanId, string[]> = {
  free: ["AI 文案生成（含多版本 A/B）", "防封節奏發文＋延遲留言", "每日成效摘要通知"],
  pro: ["免費版全部功能", "最佳發文時段自動套用", "常青回收批次排程"],
  business: ["專業版全部功能", "更高發文帳號上限", "優先支援"]
};

export default async function PricingPage() {
  const user = await getCurrentUser();
  const current = user ? await getUserPlan(user.id) : "free";

  return (
    <div className="space-y-8">
      <div className="text-center sm:py-4">
        <span className="badge-brand mx-auto mb-3 w-fit">定價</span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">選一個合適的規模</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-2">
          依「可連結的 Threads 發文帳號數」分級，功能隨方案解鎖。
          {user?.isOwner && "（你是管理者，不受方案上限限制。）"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((id) => {
          const isCurrent = id === current;
          const featured = id === "pro";
          return (
            <div
              key={id}
              className={
                "relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card transition-shadow hover:shadow-pop " +
                (isCurrent ? "border-brand ring-2 ring-brand/30" : featured ? "border-strong" : "border-border")
              }
            >
              {featured && !isCurrent && (
                <span className="badge-brand absolute -top-2.5 left-6">熱門</span>
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{PLAN_LABELS[id]}</h2>
                {isCurrent && <span className="badge-brand">目前方案</span>}
              </div>
              <div className="mt-3 text-3xl font-bold tracking-tight">{PRICE[id]}</div>
              <div className="mt-1 text-sm text-ink-2">可連結 {PLANS[id].maxThreadsAccounts} 個發文帳號</div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-ink-2">
                {PERKS[id].map((p) => (
                  <li key={p} className="flex gap-2.5">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {isCurrent ? (
                  <span className="btn btn-outline pointer-events-none w-full opacity-60">使用中</span>
                ) : id === "free" ? (
                  <span className="btn btn-outline pointer-events-none w-full opacity-60">基本方案</span>
                ) : (
                  <span className="btn btn-outline pointer-events-none w-full opacity-60">升級即將推出</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-3">
        線上付款升級即將推出。需要更高額度或客製方案，
        <Link href="/accounts" className="text-brand hover:underline">
          回帳號管理
        </Link>
        查看目前用量。
      </p>
    </div>
  );
}
