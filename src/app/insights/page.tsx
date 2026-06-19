import { getPublishInsights } from "@/lib/store";
import { getAffiliateRevenue, type AffiliateRevenue } from "@/services/shopee/report";
import { getCurrentUser } from "@/lib/auth";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 成效統計：自家發布數據 + Shopee 分潤實際收益（owner 限定）。
export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const data = await getPublishInsights(user.id, 30);
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.count));

  // 分潤收益（僅 owner、且有設金鑰時才抓；失敗則優雅降級）
  let revenue: AffiliateRevenue | null = null;
  let revenueErr: string | null = null;
  if (user.isOwner && !isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    try {
      revenue = await getAffiliateRevenue(30);
    } catch (e) {
      revenueErr = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">成效統計</h1>
        <p className="text-sm text-neutral-500">
          近 {data.days} 天共發布 <b className="text-shopee">{data.totalPublished}</b> 篇。
        </p>
      </div>

      {revenue && <RevenueSection r={revenue} />}
      {revenueErr && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          分潤收益讀取失敗：{revenueErr}
        </div>
      )}

      <section className="rounded-lg border bg-white p-5">
        <h2 className="mb-3 font-semibold">每日發布量</h2>
        {data.byDay.length === 0 ? (
          <p className="text-sm text-neutral-400">近 30 天尚無已發布貼文。</p>
        ) : (
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {data.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}：${d.count} 篇`}>
                <div className="w-full rounded-t bg-shopee" style={{ height: `${(d.count / maxDay) * 100}%` }} />
                <span className="text-[10px] text-neutral-400">{d.date}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
    <section className="rounded-lg border bg-white p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between">
                <span className="truncate pr-2">{r.name}</span>
                <span className="shrink-0 text-neutral-500">{r.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-100">
                <div className="h-full bg-shopee/70" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
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
      <section className="rounded-lg border bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">分潤收益（近 {r.days} 天，Shopee 分潤報表）</h2>
          <div className="text-2xl font-bold text-shopee">{money(r.totalCommission)}</div>
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          {r.totalConversions} 筆轉換
          {r.truncated && "（資料量大，僅統計前數頁）"}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {r.byStatus.map((s) => (
            <span key={s.status} className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-600">
              {s.status}：{s.count} 筆 / {money(s.commission)}
            </span>
          ))}
        </div>
        {r.byDay.length > 0 && (
          <div className="mt-4 flex items-end gap-1" style={{ height: 100 }}>
            {r.byDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}：${money(d.commission)}`}>
                <div className="w-full rounded-t bg-green-500" style={{ height: `${(d.commission / maxDay) * 100}%` }} />
                <span className="text-[10px] text-neutral-400">{d.date.slice(5)}</span>
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
    <section className="rounded-lg border bg-white p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">尚無資料</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.name} className="text-sm">
              <div className="mb-0.5 flex justify-between gap-2">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 text-neutral-500">{money(r.value)} · {r.sub}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-neutral-100">
                <div className="h-full bg-green-500/70" style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
