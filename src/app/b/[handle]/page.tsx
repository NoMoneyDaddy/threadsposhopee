import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBioPageByHandle } from "@/lib/redirect-store";
import { normalizeBioHandle } from "@/lib/credentials";

export const dynamic = "force-dynamic";

// 公開 bio 頁（/b/<handle>）：列出該使用者選入 bio 的短連結，點擊走 go2read 中轉頁（含揭露）。
// 不建索引（與 /r/* 一致，降低外露面）。
// 信任邊界：route param 先過 normalizeBioHandle（小寫、[a-z0-9_-]{3,30}），不合法即視為找不到，
// 並以正規化後的 handle 查詢／顯示（避免 /b/@foo 查不到、或 fallback 標題出現 @@）。
export async function generateMetadata({ params }: { params: { handle: string } }): Promise<Metadata> {
  const handle = normalizeBioHandle(params.handle);
  const page = handle ? await getBioPageByHandle(handle).catch(() => null) : null;
  if (!page) return { title: "找不到頁面", robots: { index: false, follow: false } };
  return { title: page.title ?? `@${handle}`, robots: { index: false, follow: false } };
}

export default async function BioPage({ params }: { params: { handle: string } }) {
  const handle = normalizeBioHandle(params.handle);
  const page = handle ? await getBioPageByHandle(handle).catch(() => null) : null;
  if (!page || !handle) notFound();

  const title = page.title ?? `@${handle}`;
  // 頭像缺省用標題/handle 首字做 monogram（避免空頭像）。用 Intl.Segmenter 取第一個 grapheme，
  // 才不會把 emoji／旗幟／結合字元切壞（[...str][0] 會）。
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const firstChar = seg.segment(page.title?.trim() || handle)[Symbol.iterator]().next().value?.segment;
  const monogram = (firstChar || "@").toUpperCase();

  return (
    <div className="relative min-h-[100dvh] overflow-hidden">
      {/* 柔和漸層背景（克制）：頂部一抹分潤線色，往下淡出 */}
      <div aria-hidden className="accent-line pointer-events-none absolute inset-x-0 top-0 h-40 opacity-[0.06]" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center px-4 pb-16 pt-14">
        {/* 頭像 monogram：漸層外環 + 內白底 */}
        <div className="accent-line mb-4 grid h-20 w-20 place-items-center rounded-full p-[3px] shadow-[var(--shadow-card)]">
          <div className="grid h-full w-full place-items-center rounded-full bg-surface text-2xl font-bold text-ink">
            {monogram}
          </div>
        </div>
        <h1 className="text-center text-xl font-bold tracking-tight">{title}</h1>
        {page.title && <p className="mt-0.5 text-sm text-ink-3">@{handle}</p>}
        <span aria-hidden className="accent-line mb-7 mt-4 block h-1 w-12 rounded-full" />

        {page.links.length === 0 ? (
          <p className="text-sm text-ink-3">這個頁面還沒有連結。</p>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {page.links.map((l) => (
              <a
                key={l.code}
                href={`/r/${l.code}`}
                className="group flex items-center gap-3 rounded-2xl border border-strong bg-surface px-4 py-3.5 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md active:translate-y-0"
              >
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3">🔗</span>
                )}
                <span className="min-w-0 flex-1 truncate">{l.title ?? "前往連結"}</span>
                <span aria-hidden className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            ))}
          </div>
        )}

        <p className="mt-auto pt-10 text-center text-[11px] text-ink-3">
          點擊連結會經過揭露式中轉頁，再前往來源（可能含合作推廣連結）。
        </p>
      </div>
    </div>
  );
}
