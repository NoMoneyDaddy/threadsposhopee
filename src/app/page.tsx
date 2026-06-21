import RunPipelineButton from "@/components/RunPipelineButton";
import LiveDashboard from "@/components/LiveDashboard";
import SetupGuide from "@/components/SetupGuide";
import { getCurrentUser } from "@/lib/auth";
import { getSetupSteps } from "@/lib/setup-status";
import { getPublishInsights } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const steps = user ? await getSetupSteps(user) : [];
  // 本週概覽（近 7 天，每人自己的發布資料）；失敗則略過不擋頁。
  const weekly = user
    ? await getPublishInsights(user.id, { startMs: Date.now() - 7 * 86400_000, endMs: Date.now() }).catch(() => null)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">儀表板</h1>
          <p className="text-sm text-ink-2">即時連動各服務，每 20 秒自動更新</p>
        </div>
        <RunPipelineButton />
      </div>

      {steps.length > 0 && <SetupGuide steps={steps} />}

      {weekly && (
        <a href="/insights?days=7" className="block rounded-2xl border bg-surface p-4 hover:border-brand/40">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="section-title text-base">本週概覽</h2>
            <span className="text-xs text-brand">查看成效 →</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="stat-num text-xl text-brand">{weekly.totalPublished}</div>
              <div className="text-[11px] text-ink-2">近 7 天發布</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="truncate text-sm font-medium">{weekly.byAccount[0]?.name ?? "—"}</div>
              <div className="text-[11px] text-ink-2">最活躍帳號</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-2">
              <div className="truncate text-sm font-medium">{weekly.byProduct[0]?.name ?? "—"}</div>
              <div className="text-[11px] text-ink-2">熱門商品</div>
            </div>
          </div>
        </a>
      )}

      <LiveDashboard />
    </div>
  );
}
