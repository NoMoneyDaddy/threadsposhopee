import LiveDashboard from "@/components/LiveDashboard";
import SetupGuide from "@/components/SetupGuide";
import HotProductsRadar from "@/components/HotProductsRadar";
import AchievementsCard from "@/components/AchievementsCard";
import { getCurrentUser } from "@/lib/auth";
import { getSetupSteps } from "@/lib/setup-status";
import { getPublishInsights, getFeatureFlags, listHotProducts, getContributionScore, listPublishedDates, countPublished, getHeartbeat, type SharedMaterial } from "@/lib/store";
import { cronHeartbeatStatus } from "@/lib/cron-status";
import { computeStreak, taipeiDateStr, achievementsFor } from "@/lib/streak";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  // 設定引導卡：任一狀態查詢失敗也不該 500 整個首頁（與下方其他查詢一致用 catch 降級）。
  const steps = user
    ? await getSetupSteps(user).catch((err) => {
        // 記錄真正失敗的相依（哪個狀態查詢拋錯），以便排查；UI 降級為不顯示設定卡。
        log.error("getSetupSteps 失敗", { err: err instanceof Error ? err.message : String(err) });
        return [];
      })
    : [];
  // 本週概覽（近 7 天，每人自己的發布資料）；失敗則略過不擋頁。
  const weekly = user
    ? await getPublishInsights(user.id, { startMs: Date.now() - 7 * 86400_000, endMs: Date.now() }).catch(() => null)
    : null;

  // 自動駕駛（排程器心跳）：讓使用者一眼確認「排程到了會自動發」——直接回應「排程時間到沒發」的疑慮。
  const cron = user ? cronHeartbeatStatus(await getHeartbeat().catch(() => null), Date.now()) : null;

  // 選品雷達（全站熱門共享商品；共享庫開啟才顯示）＋ 成就/連續發文。
  let hot: SharedMaterial[] = [];
  let streak = 0;
  let achievements = achievementsFor({ published: 0, contribution: 0, streak: 0 });
  if (user) {
    const flags = await getFeatureFlags().catch(() => null);
    const [h, contribution, pubDates, publishedCount] = await Promise.all([
      flags?.shared ? listHotProducts(8).catch(() => []) : Promise.resolve([]),
      getContributionScore(user.id).catch(() => 0),
      listPublishedDates(user.id).catch(() => []),
      countPublished(user.id).catch(() => 0)
    ]);
    hot = h;
    streak = computeStreak(pubDates, taipeiDateStr(Date.now()));
    achievements = achievementsFor({ published: publishedCount, contribution, streak });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">儀表板</h1>
          <p className="text-sm text-ink-2">即時連動各服務，每 30 秒自動更新</p>
        </div>
        {user && (
          <a href="/pipeline" className="btn btn-brand whitespace-nowrap">
            ▶ 去工作台發文
          </a>
        )}
      </div>

      {cron && (
        <p className={`text-xs ${cron.tone}`} role="status" aria-live="polite" title="自動發文靠排程器定時執行；若顯示停了，排程時間到也不會自動發">
          {cron.text}
        </p>
      )}

      {steps.length > 0 && <SetupGuide steps={steps} />}

      {weekly && (
        <a href="/insights?days=7" className="card block p-4 transition-colors hover:border-brand/40">
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

      {user && <AchievementsCard streak={streak} achievements={achievements} />}

      {user && <HotProductsRadar items={hot} />}

      <LiveDashboard />
    </div>
  );
}
