import { getPublishInsights, getShopeeCredentials } from "@/lib/store";
import { listThreadsAccounts } from "@/lib/accounts-store";
import { getAffiliateRevenue, type AffiliateRevenue } from "@/services/shopee/report";
import { getEngagementCached, bestPostingTimes, insightsHintKind, type EngagementSummary } from "@/services/threads/engagement";
import { threadsScopeEnabled } from "@/services/threads/oauth";
import { detectReachDrop } from "@/services/threads/reach";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { INSIGHTS_PERIODS as PERIODS, resolveInsightsRange } from "@/lib/insights-range";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 成效統計：自家發布數據 + Shopee 分潤實際收益（owner 限定）。
// 支援預設區間（days）與自訂日期區間（from/to，台北）。
export default async function InsightsPage({
  searchParams
}: {
  searchParams: { days?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  const { startMs, endMs, days, label: rangeLabel } = resolveInsightsRange(searchParams);

  // 帳號清單查一次，供 getPublishInsights（分項報表）與分潤歸因共用，避免同請求重複查 threads_accounts。
  const accounts = await listThreadsAccounts(user.id).catch(() => []);
  // 三項彼此無依賴（發布統計／分潤收益／互動數據），改 Promise.all 並行避免序列瀑布。
  const [data, revResult, engagement] = await Promise.all([
    getPublishInsights(user.id, { startMs, endMs }, accounts.map((a) => ({ id: a.id, label: a.label }))),
    // 分潤收益吃使用者「自己」綁的 Shopee 金鑰；沒綁就不顯示（回 null）。失敗則優雅降級，用 IIFE 保留自身 try/catch。
    (async (): Promise<{ revenue: AffiliateRevenue | null; revenueErr: string | null }> => {
      if (isDemoMode) return { revenue: null, revenueErr: null };
      const creds = await getShopeeCredentials(user.id).catch(() => null);
      if (!creds) return { revenue: null, revenueErr: null };
      try {
        // 依 sp_<帳號碼> 把分潤歸因到各帳號（共用上方 accounts）
        const revenue = await getAffiliateRevenue(
          { appId: creds.appId, secret: creds.secret },
          { startMs, endMs },
          accounts.map((a) => ({ id: a.id, label: a.label }))
        );
        return { revenue, revenueErr: null };
      } catch (e) {
        return { revenue: null, revenueErr: e instanceof Error ? e.message : String(e) };
      }
    })(),
    // Threads 貼文互動數據（每人自己的帳號；逐篇查 insights，失敗則優雅降級不擋頁）
    isDemoMode ? Promise.resolve(null) : getEngagementCached(user.id, 15).catch(() => null)
  ]);
  const { revenue, revenueErr } = revResult;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">成效分析</h1>
        <p className="text-sm text-ink-2">
          {rangeLabel}共發布 <b className="text-brand">{data.totalPublished}</b> 篇。
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <a
              key={p.days}
              href={`/insights?days=${p.days}`}
              aria-current={p.days === days ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-xs ${
                p.days === days ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-neutral-200"
              }`}
            >
              {p.label}
            </a>
          ))}
          <a
            href={`/api/insights/export?days=${days}`}
            className="ml-auto rounded-lg border border-brand/40 px-3 py-1 text-xs text-brand hover:bg-brand/10"
          >
            匯出 CSV
          </a>
        </div>
      </div>

      {revenue && <RevenueSection r={revenue} />}
      {revenueErr && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700" role="alert">
          分潤收益讀取失敗：{revenueErr}
        </div>
      )}

      {engagement && engagement.fetched >= 6 && <ReachDropBanner e={engagement} />}
      {engagement && engagement.fetched > 0 && <EngagementSection e={engagement} />}
      {engagement && engagement.fetched >= 3 && <BestTimesSection e={engagement} />}
      {!isDemoMode && (!engagement || engagement.fetched < 3) && (
        <section className="rounded-2xl border border-dashed border-border bg-surface p-5">
          <h2 className="section-title mb-1">最佳發文時段</h2>
          <p className="text-sm text-ink-2">
            這裡會依你貼文的 <b>Threads 互動數據</b>（各時段／星期的平均觀看）算出最佳發文時段。
            目前已收集 <b>{engagement?.fetched ?? 0}/3</b> 篇有互動數據的貼文（需至少 3 篇）——多發幾篇就會出現。
          </p>
          {(() => {
            // 抓不到任何互動數據的提示：依目前實際請求的 scope 決定文案（避免在已關閉 insights 的部署叫人白做工）。
            const hint = insightsHintKind(engagement, threadsScopeEnabled("threads_manage_insights"));
            if (hint === "reauth")
              return (
                <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  ⚠️ 已有發布貼文卻抓不到任何互動數據，通常是帳號的授權尚未包含「成效數據（insights）」權限。
                  請到「帳號管理」<b>重新授權 Threads</b>（重新綁定）以取得成效權限。
                </p>
              );
            if (hint === "enable_scope")
              return (
                <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  ⚠️ 已有發布貼文卻抓不到任何互動數據，且目前部署的 <code>THREADS_SCOPES</code> 未包含成效權限。
                  請先在環境設定加入 <code>threads_manage_insights</code> 再重新授權 Threads。
                </p>
              );
            return null;
          })()}
        </section>
      )}

      <section className="card p-5">
        <h2 className="section-title mb-1">每日發布量</h2>
        <p className="mb-3 text-xs text-ink-3">每天發出幾篇貼文（長條越高發越多）。</p>
        {data.byDay.length === 0 ? (
          <p className="text-sm text-ink-2">
            這段期間還沒有已發布的貼文。到「工作台」核准草稿或手動發文後，這裡就會出現每日發布量。
          </p>
        ) : (
          <DayBars rows={data.byDay.map((d) => ({ date: d.date, value: d.count }))} color="bg-brand" fmt={(v) => `${v} 篇`} />
        )}
      </section>

      <RankCard title="各帳號發布次數" rows={data.byAccount} empty="尚無資料" />

      <div className="grid gap-4 md:grid-cols-2">
        <RankCard title="熱門商品（發布次數）" rows={data.byProduct} empty="尚無資料" />
        <RankCard title="來源貢獻（發布次數）" rows={data.bySource} empty="尚無資料" />
      </div>
    </div>
  );
}

function RankCard({ title, rows, empty }: { title: string; rows: { name: string; count: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-2xl border bg-surface p-5">
      <h2 className="section-title mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between">
                <span className="min-w-0 flex-1 truncate pr-2">{r.name}</span>
                <span className="shrink-0 text-ink-2 tabular-nums">{r.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-surface-2">
                <div className="h-full bg-brand/70" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function num(n: number) {
  return n.toLocaleString("zh-TW");
}

// 觸及驟降預警：近期貼文中位觀看明顯低於基準 → 疑似被降觸及／shadowban，提醒放慢。
function ReachDropBanner({ e }: { e: EngagementSummary }) {
  const d = detectReachDrop(e.posts);
  if (!d.hasSignal) return null;
  const pct = Math.round(d.ratio * 100);
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
      <div className="font-semibold">⚠️ 近期觀看數疑似大幅下降（可能被系統減少曝光）</div>
      <p className="mt-1">
        近期貼文中位觀看 <b>{num(d.recentMedian)}</b>，僅為基準 <b>{num(d.baselineMedian)}</b> 的 <b>{pct}%</b>。
        建議放慢發文節奏、檢查內容是否過度推廣或近似重複，並暫停一兩天觀察恢復情形。
      </p>
      <p className="mt-1 text-xs text-amber-600">
        註：跨帳號綜合樣本（近 {d.recentN + d.baselineN} 篇有數據），僅供方向參考。
      </p>
    </div>
  );
}

function EngagementSection({ e }: { e: EngagementSummary }) {
  const t = e.totals;
  const cards: { label: string; value: number }[] = [
    { label: "觀看", value: t.views },
    { label: "讚", value: t.likes },
    { label: "留言", value: t.replies },
    { label: "轉發", value: t.reposts },
    { label: "引用", value: t.quotes },
    { label: "分享", value: t.shares }
  ];
  const maxViews = Math.max(1, ...e.posts.map((p) => p.views));
  return (
    <section className="rounded-2xl border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Threads 互動成效</h2>
        <span className="text-xs text-ink-2">最近 {e.sampled} 篇，{e.fetched} 篇有數據</span>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-surface-2 p-2 text-center">
            <div className="stat-num text-lg text-brand">{num(c.value)}</div>
            <div className="text-[11px] text-ink-2">{c.label}</div>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {e.posts.map((p) => (
          <li key={p.id} className="text-sm">
            <div className="mb-0.5 flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate pr-2">{p.productName ?? "（未命名貼文）"}</span>
              <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                👁 {num(p.views)} · ♥ {num(p.likes)} · 💬 {num(p.replies)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-surface-2">
              <div className="h-full bg-brand/70" style={{ width: `${(p.views / maxViews) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BestTimesSection({ e }: { e: EngagementSummary }) {
  const best = bestPostingTimes(e.posts);
  if (best.byHour.length === 0) return null;
  const TimeRank = ({ title, rows }: { title: string; rows: { label: string; avgViews: number; posts: number }[] }) => {
    const max = Math.max(1, ...rows.map((r) => r.avgViews));
    return (
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink-2">{title}</h3>
        <ul className="space-y-2">
          {rows.slice(0, 5).map((r) => (
            <li key={r.label} className="text-sm">
              <div className="mb-0.5 flex justify-between gap-2">
                <span>{r.label}</span>
                <span className="shrink-0 text-xs text-ink-2 tabular-nums">平均 {num(r.avgViews)} 觀看 · {r.posts} 篇</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-surface-2">
                <div className="h-full bg-brand/70" style={{ width: `${(r.avgViews / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <section className="rounded-2xl border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">最佳發文時段</h2>
        <span className="text-xs text-ink-3">依最近 {e.fetched} 篇平均觀看，樣本少僅供參考（時區 Asia/Taipei）</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TimeRank title="時段（每日）" rows={best.byHour} />
        <TimeRank title="星期" rows={best.byWeekday} />
      </div>
      {/* 把分析接回行動：到工作台再排一篇時勾「最佳時段」即自動套用，避免使用者得自己記時間回去手排。 */}
      <p className="mt-3 text-xs text-ink-3">
        想自動套用？到{" "}
        <Link href="/pipeline" className="text-brand underline hover:opacity-80">
          工作台
        </Link>{" "}
        從素材「再排一篇」時勾選「最佳時段」，系統會自動挑這些高觸及時段排程。
      </p>
    </section>
  );
}

function money(n: number) {
  return `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 每日趨勢迷你長條圖：細長條填滿寬度（min-w-0 flex-1 才能在窄螢幕收縮、不被日期標籤撐爆溢出），
// 數值不逐根常駐（會擠爆＋溢出），改 hover title／aria-label；X 軸只標頭尾日期，一眼看出區間趨勢。
function DayBars({ rows, color, fmt }: { rows: { date: string; value: number }[]; color: string; fmt: (v: number) => string }) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 96 }}>
        {rows.map((r) => (
          <div
            key={r.date}
            className="min-w-0 flex-1"
            role="img"
            aria-label={`${r.date}：${fmt(r.value)}`}
            title={`${r.date}：${fmt(r.value)}`}
          >
            <div className={`w-full rounded-t ${color}`} style={{ height: `${(r.value / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{first}</span>
        {last !== first && <span>{last}</span>}
      </div>
    </div>
  );
}

// Shopee 分潤轉換狀態英文 → 繁中（未知狀態原樣顯示）。
const REVENUE_STATUS_ZH: Record<string, string> = {
  pending: "待結算",
  completed: "已結算",
  cancelled: "已取消",
  canceled: "已取消"
};
function revenueStatusZh(s: string): string {
  return REVENUE_STATUS_ZH[s.trim().toLowerCase()] ?? s;
}

function RevenueSection({ r }: { r: AffiliateRevenue }) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">分潤收益（近 {r.days} 天，Shopee 分潤報表）</h2>
          <div className="stat-num text-2xl text-brand">{money(r.totalCommission)}</div>
        </div>
        <div className="mt-1 text-xs text-ink-2">
          {r.totalConversions} 筆轉換
          {r.truncated && "（資料量大，僅統計前數頁）"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {r.byStatus.map((s) => (
            <span key={s.status} className="rounded-xl bg-surface-2 px-2 py-1 text-ink-2" title={s.status}>
              {revenueStatusZh(s.status)}：{s.count} 筆 / {money(s.commission)}
            </span>
          ))}
        </div>
        {r.byDay.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs text-ink-3">每日佣金（長條越高當日佣金越多）</div>
            <DayBars rows={r.byDay.map((d) => ({ date: d.date.slice(5), value: d.commission }))} color="bg-green-500" fmt={money} />
          </div>
        )}
      </section>

      {r.byAccount && r.byAccount.length > 0 && (
        <RevenueRank
          title="各帳號分潤收益（依 sp_ 標記歸因）"
          rows={r.byAccount.map((a) => ({ name: a.name, value: a.commission, sub: `${a.count} 筆` }))}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <RevenueRank title="收益最高商品" rows={r.byItem.map((i) => ({ name: i.name, value: i.commission, sub: `${i.count} 筆` }))} />
        <RevenueRank title="收益來源（依連結標記）" rows={r.bySubId.map((s) => ({ name: s.subId, value: s.commission, sub: `${s.count} 筆` }))} />
      </div>
    </div>
  );
}

function RevenueRank({ title, rows }: { title: string; rows: { name: string; value: number; sub: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-2xl border bg-surface p-5">
      <h2 className="section-title mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">尚無資料</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="shrink-0 text-ink-2 tabular-nums">{money(r.value)} · {r.sub}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-surface-2">
                <div className="h-full bg-green-500/70" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
