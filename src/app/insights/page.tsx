import { getPublishInsights } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 成效統計：用自家已發布資料呈現「發了什麼、發了多少」。
// 註：點擊/分潤收益需另接 Shopee 分潤報表 API（待開權限）；此處先呈現發布面向的數據。
export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const data = await getPublishInsights(user.id, 30);
  const maxDay = Math.max(1, ...data.byDay.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">成效統計</h1>
        <p className="text-sm text-neutral-500">
          近 {data.days} 天共發布 <b className="text-shopee">{data.totalPublished}</b> 篇。
          （點擊／分潤收益需另接 Shopee 分潤報表 API）
        </p>
      </div>

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
