import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBioPageByHandle } from "@/lib/redirect-store";

export const dynamic = "force-dynamic";

// 公開 bio 頁（/b/<handle>）：列出該使用者選入 bio 的短連結，點擊走 go2read 中轉頁（含揭露）。
// 不建索引（與 /r/* 一致，降低外露面）。
export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const page = await getBioPageByHandle(params.handle).catch(() => null);
  if (!page) return { title: "找不到頁面", robots: { index: false, follow: false } };
  return { title: page.title ?? `@${params.handle}`, robots: { index: false, follow: false } };
}

export default async function BioPage({ params }: { params: { handle: string } }) {
  const page = await getBioPageByHandle(params.handle).catch(() => null);
  if (!page) notFound();

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-4 py-10">
      <h1 className="mb-1 text-center text-2xl font-bold tracking-tight">{page.title ?? `@${params.handle}`}</h1>
      <span aria-hidden className="accent-line mb-6 block h-1 w-12 rounded-full" />
      {page.links.length === 0 ? (
        <p className="text-sm text-ink-3">這個頁面還沒有連結。</p>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {page.links.map((l) => (
            <a
              key={l.code}
              href={`/r/${l.code}`}
              className="flex items-center gap-3 rounded-2xl border border-strong bg-surface px-4 py-3 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors hover:border-brand/40 hover:bg-surface-2"
            >
              {l.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
              )}
              <span className="min-w-0 flex-1 truncate">{l.title ?? "前往連結"}</span>
              <span aria-hidden className="shrink-0 text-ink-3">→</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
