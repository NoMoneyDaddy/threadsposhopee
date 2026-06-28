import { getCurrentUser } from "@/lib/auth";
import { listRedirectLinks } from "@/lib/redirect-store";
import RedirectLinkForm from "@/components/RedirectLinkForm";
import RedirectLinkRow from "@/components/RedirectLinkRow";
import EmptyState from "@/components/EmptyState";
import SelfBuyNotice from "@/components/SelfBuyNotice";

export const dynamic = "force-dynamic";

// go2read 短連結管理：建立 ＋ 列出（含點擊/繼續統計）。
export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user) return <div className="text-center text-sm text-red-500">請先登入。</div>;
  const links = await listRedirectLinks(user.id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">轉址服務</h1>
        <p className="text-sm text-ink-2">把長連結變成你自己的短連結；別人點開會先看到預覽頁，再前往原始來源。</p>
      </div>

      <RedirectLinkForm />

      <SelfBuyNotice />

      <section className="card p-5">
        <h2 className="section-title mb-3">我的短連結</h2>
        {links.length === 0 ? (
          <EmptyState
            icon="🔗"
            title="還沒有短連結"
            hint="用上方表單貼一個連結，就能產生你自己的短連結；別人點開會先看到預覽頁再前往原文。"
          />
        ) : (
          <ul className="divide-y divide-border">
            {links.map((l) => (
              <RedirectLinkRow
                key={l.code}
                link={{
                  code: l.code,
                  sourceUrl: l.sourceUrl,
                  title: l.title,
                  clicks: l.clicks,
                  continues: l.continues
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
