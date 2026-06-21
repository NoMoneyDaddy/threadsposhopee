import { getPublishInsights } from "@/lib/store";
import { getAffiliateRevenue, type AffiliateRevenue } from "@/services/shopee/report";
import { getEngagementCached, bestPostingTimes, type EngagementSummary } from "@/services/threads/engagement";
import { detectReachDrop } from "@/services/threads/reach";
import { getCurrentUser } from "@/lib/auth";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 區間預設：今日 / 近 7 / 30 / 90 / 365 天（日/週/月/季/年報表）。
const PERIODS: { days: number; label: string }[] = [
  { days: 1, label: "今日" },
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" },
  { days: 365, label: "近一年" }
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 把台北日期（YYYY-MM-DD）轉成 epoch ms。台北固定 UTC+8、無日光節約。
function taipeiMs(date: string, end: boolean): number | null {
  if (!DATE_RE.test(date)) return null;
  const t = Date.parse(`${date}T${end ? "23:59:59" : "00:00:00"}+08:00`);
  return Number.isNaN(t) ? null : t;
}

// 成效統計：自家發布數據 + Shopee 分潤實際收益（owner 限定）。
// 支援預設區間（days）與自訂日期區間（from/to，台北）。
export default async function InsightsPage({
  searchParams
}: {
  searchParams: { days?: string; from?: string; to?: string };
}) {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;

  // 自訂區間優先；無效則退回預設 days。
  const fromMs = searchParams.from ? taipeiMs(searchParams.from, false) : null;
  const toMs = searchParams.to ? taipeiMs(searchParams.to, true) : null;
  const custom = fromMs !== null && toMs !== null && fromMs <= toMs;
  const days = PERIODS.some((p) => p.days === Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const endMs = custom ? (toMs as number) : Date.now();
  const startMs = custom ? (fromMs as number) : endMs - days * 86400_000;
  const rangeLabel = custom
    ? `${searchParams.from} ~ ${searchParams.to}`
    : PERIODS.find((p) => p.days === days)?.label ?? `近 ${days} 天`;

  const data = await getPublishInsights(user.id, { startMs, endMs });
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.count));

  // 分潤收益（僅 owner、且有設金鑰時才抓；失敗則優雅降級）
  let revenue: AffiliateRevenue | null = null;
  let revenueErr: string | null = null;
  if (user.isOwner && !isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    try {
      revenue = await getAffiliateRevenue({ startMs, endMs });
    } catch (e) {
      revenueErr = e instanceof Error ? e.message : String(e);
    }
  }

  // Threads 貼文互動數據（每人自己的帳號；逐篇查 insights，失敗則優雅降級不擋頁）
  const engagement = isDemoMode ? null : await getEngagementCached(user.id, 15).catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">成效</h1>
        <p className="text-sm text-ink-2">
          {rangeLabel}共發布 <b className="text-brand">{data.totalPublished}</b> 篇。
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <a
              key={p.days}
              href={`/insights?days=${p.days}`}
              className={`rounded-full px-3 py-1 text-xs ${
                !custom && p.days === days ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-neutral-200"
              }`}
            >
              {p.label}
            </a>
          ))}
        </div>
        {/* 自訂日期區間（GET 表單；台北日期） */}
        <form method="get" className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-2">
            起<input type="date" name="from" defaultValue={searchParams.from ?? ""} className="ml-1 rounded-lg border px-2 py-1 text-xs" />
          </label>
          <label className="text-xs text-ink-2">
            迄<input type="date" name="to" defaultValue={searchParams.to ?? ""} className="ml-1 rounded-lg border px-2 py-1 text-xs" />
          </label>
          <button type="submit" className="rounded-lg bg-surface-2 px-3 py-1 text-xs text-ink-2 hover:bg-neutral-200">
            套用區間
          </button>
          {custom && (
            <a href="/insights" className="rounded-lg px-2 py-1 text-xs text-ink-3 hover:text-ink">
              清除
            </a>
          )}
        </form>
      </div>

      {revenue && <RevenueSection r={revenue} />}
      {revenueErr && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          分潤收益讀取失敗：{revenueErr}
        </div>
      )}

      {engagement && engagement.fetched >= 6 && <ReachDropBanner e={engagement} />}
      {engagement && engagement.fetched > 0 && <EngagementSection e={engagement} />}
      {engagement && engagement.fetched >= 3 && <BestTimesSection e={engagement} />}

      <section className="rounded-2xl border bg-surface p-5">
        <h2 className="mb-3 font-semibold">每日發布量</h2>
        {data.byDay.length === 0 ? (
          <p className="text-sm text-ink-3">此區間尚無已發布貼文。</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {data.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}：${d.count} 篇`}>
                <div className="w-full rounded-t bg-brand" style={{ height: `${(d.count / maxDay) * 100}%` }} />
                <span className="text-[10px] text-ink-3">{d.date}</span>
              </div>
            ))}
          </div>
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
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between">
                <span className="truncate pr-2">{r.name}</span>
                <span className="shrink-0 text-ink-2">{r.count}</span>
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
      <div className="font-semibold">⚠️ 觸及疑似驟降（疑似被降觸及／shadowban）</div>
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
        <h2 className="font-semibold">Threads 互動成效</h2>
        <span className="text-xs text-ink-2">最近 {e.sampled} 篇，{e.fetched} 篇有數據</span>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl bg-surface-2 p-2 text-center">
            <div className="text-lg font-bold tabular-nums text-brand">{num(c.value)}</div>
            <div className="text-[11px] text-ink-2">{c.label}</div>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {e.posts.map((p) => (
          <li key={p.id} className="text-sm">
            <div className="mb-0.5 flex justify-between gap-2">
              <span className="truncate pr-2">{p.productName ?? "（未命名貼文）"}</span>
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
        <h2 className="font-semibold">最佳發文時段</h2>
        <span className="text-xs text-ink-3">依最近 {e.fetched} 篇平均觀看，樣本少僅供參考（時區 Asia/Taipei）</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TimeRank title="時段（每日）" rows={best.byHour} />
        <TimeRank title="星期" rows={best.byWeekday} />
      </div>
    </section>
  );
}

function money(n: number) {
  return `NT$ ${n.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RevenueSection({ r }: { r: AffiliateRevenue }) {
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.commission));
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">分潤收益（近 {r.days} 天，Shopee 分潤報表）</h2>
          <div className="text-2xl font-bold text-brand">{money(r.totalCommission)}</div>
        </div>
        <div className="mt-1 text-xs text-ink-2">
          {r.totalConversions} 筆轉換
          {r.truncated && "（資料量大，僅統計前數頁）"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {r.byStatus.map((s) => (
            <span key={s.status} className="rounded-xl bg-surface-2 px-2 py-1 text-ink-2">
              {s.status}：{s.count} 筆 / {money(s.commission)}
            </span>
          ))}
        </div>
        {r.byDay.length > 0 && (
          <div className="mt-4 flex items-end gap-1" style={{ height: 100 }}>
            {r.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}：${money(d.commission)}`}>
                <div className="w-full rounded-t bg-green-500" style={{ height: `${(d.commission / maxDay) * 100}%` }} />
                <span className="text-[10px] text-ink-3">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <RevenueRank title="收益最高商品" rows={r.byItem.map((i) => ({ name: i.name, value: i.commission, sub: `${i.count} 筆` }))} />
        <RevenueRank title="收益來源（subId / utm）" rows={r.bySubId.map((s) => ({ name: s.subId, value: s.commission, sub: `${s.count} 筆` }))} />
      </div>
    </div>
  );
}

function RevenueRank({ title, rows }: { title: string; rows: { name: string; value: number; sub: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-2xl border bg-surface p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">尚無資料</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-ink-2">{money(r.value)} · {r.sub}</span>
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
