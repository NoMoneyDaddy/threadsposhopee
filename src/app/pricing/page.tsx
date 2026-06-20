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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">方案與定價</h1>
        <p className="mt-1 text-sm text-neutral-500">
          依「可連結的 Threads 發文帳號數」分級。
          {user?.isOwner && "（你是管理者，不受方案上限限制。）"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {ORDER.map((id) => {
          const isCurrent = id === current;
          return (
            <div
              key={id}
              className={`flex flex-col rounded-xl border bg-white p-5 ${
                isCurrent ? "border-shopee ring-2 ring-shopee/30" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{PLAN_LABELS[id]}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-shopee/10 px-2 py-0.5 text-xs text-shopee">目前方案</span>
                )}
              </div>
              <div className="mt-2 text-2xl font-bold">{PRICE[id]}</div>
              <div className="mt-1 text-sm text-neutral-500">
                可連結 {PLANS[id].maxThreadsAccounts} 個發文帳號
              </div>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-neutral-600">
                {PERKS[id].map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-shopee">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <span className="block rounded-md border px-3 py-2 text-center text-sm text-neutral-400">
                    使用中
                  </span>
                ) : id === "free" ? (
                  <span className="block rounded-md border px-3 py-2 text-center text-sm text-neutral-400">
                    基本方案
                  </span>
                ) : (
                  <a
                    href="mailto:leo810512@gmail.com?subject=ThreadsPoShopee 升級方案"
                    className="block rounded-md bg-shopee px-3 py-2 text-center text-sm font-medium text-white hover:opacity-90"
                  >
                    聯絡升級
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-400">
        線上付款升級即將推出。需要更高額度或客製方案，
        <Link href="/accounts" className="text-shopee hover:underline">
          回帳號管理
        </Link>
        查看目前用量。
      </p>
    </div>
  );
}
