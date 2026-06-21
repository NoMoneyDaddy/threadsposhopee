import { getCurrentUser } from "@/lib/auth";
import { listRedirectLinks } from "@/lib/redirect-store";
import RedirectLinkForm from "@/components/RedirectLinkForm";
import CopyLink from "@/components/CopyLink";

export const dynamic = "force-dynamic";

// go2read 短連結管理：建立 ＋ 列出（含點擊/繼續統計）。
export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const links = await listRedirectLinks(user.id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">短連結</h1>
        <p className="text-sm text-ink-2">把長連結變成你自己的短連結；別人點開會先看到預覽頁，再前往原始來源（可順便附上分潤連結）。</p>
      </div>

      <RedirectLinkForm />

      <section className="rounded-2xl border bg-surface p-5">
        <h2 className="section-title mb-3">我的短連結</h2>
        {links.length === 0 ? (
          <p className="text-sm text-ink-3">還沒有短連結。</p>
        ) : (
          <ul className="divide-y divide-border">
            {links.map((l) => (
              <li key={l.code} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.title ?? l.sourceUrl}</div>
                  <div className="truncate text-xs text-ink-3">{l.sourceUrl}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-ink-2 tabular-nums">
                    👁 {l.clicks} · ▶ {l.continues}
                  </span>
                  <CopyLink path={`/r/${l.code}`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
