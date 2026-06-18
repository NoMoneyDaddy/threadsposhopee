import { listDrafts } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 排程總覽：把「已核准且排定未來時間」的草稿依日期分組，讓使用者一眼看到接下來要發什麼。
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <div className="text-center text-sm text-red-500">請先登入。</div>;
  }
  const drafts = await listDrafts(user.id);

  const now = Date.now();
  const scheduled = drafts
    .filter((d) => d.status === "approved" && d.scheduled_at && new Date(d.scheduled_at).getTime() > now)
    .sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));

  // 依「當地日期」分組
  const groups = new Map<string, typeof scheduled>();
  for (const d of scheduled) {
    const key = new Date(d.scheduled_at!).toLocaleDateString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      timeZone: "Asia/Taipei"
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">排程總覽</h1>
        <p className="text-sm text-neutral-500">已核准、排定未來時間的草稿。發文 worker 會在時間到時依防封節奏發布。</p>
      </div>

      {scheduled.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-neutral-400">
          目前沒有排程中的貼文。到「快速發文」選「排程發布」即可加入。
        </div>
      )}

      {[...groups.entries()].map(([date, items]) => (
        <section key={date}>
          <h2 className="mb-2 text-sm font-semibold text-neutral-600">
            {date}
            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">{items.length} 篇</span>
          </h2>
          <div className="space-y-2">
            {items.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                <div className="shrink-0 text-sm font-medium tabular-nums text-shopee">
                  {new Date(d.scheduled_at!).toLocaleTimeString("zh-TW", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Taipei"
                  })}
                </div>
                {d.cloudinary_media_url && d.media_type !== "none" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.cloudinary_media_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{d.product_name ?? "（商品）"}</div>
                  <div className="truncate text-xs text-neutral-500">{d.main_text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
