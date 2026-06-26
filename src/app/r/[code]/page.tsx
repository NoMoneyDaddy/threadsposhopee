import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRedirectLinkByCode, bumpRedirectClick } from "@/lib/redirect-store";
import ContinueButton from "./ContinueButton";

export const dynamic = "force-dynamic";

// 中轉頁分享預覽（OG）：用短連結存的 title/image/description。/r/* 不建索引。
export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const link = await getRedirectLinkByCode(params.code).catch(() => null);
  if (!link) return { title: "連結不存在", robots: { index: false, follow: false } };
  return {
    title: link.title ?? "前往連結",
    description: link.description ?? undefined,
    robots: { index: false, follow: false },
    openGraph: {
      title: link.title ?? "前往連結",
      description: link.description ?? undefined,
      images: link.imageUrl ? [link.imageUrl] : undefined
    }
  };
}

// 公開中轉頁：顯示來源預覽 ＋「繼續」按鈕（一次點擊：開分潤＋前往來源）。含揭露，不做欺騙性彈窗。
export default async function RedirectPage({ params }: { params: { code: string } }) {
  const link = await getRedirectLinkByCode(params.code).catch(() => null);
  if (!link) notFound();
  await bumpRedirectClick(params.code).catch(() => {}); // best-effort 計數，不擋頁

  // 來源網域（顯示「即將前往哪裡」，增加信任感）。
  let sourceHost = "";
  try {
    sourceHost = new URL(link.sourceUrl).host.replace(/^www\./, "");
  } catch {
    /* 忽略無法解析的來源 */
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center overflow-hidden px-4 py-8">
      <div aria-hidden className="accent-line pointer-events-none absolute inset-x-0 top-0 h-28 opacity-[0.06]" />
      {/* 品牌列：把中轉頁當作獨立導流服務（go2read） */}
      <div className="relative mb-auto flex items-center gap-2">
        <span aria-hidden className="accent-line grid h-7 w-7 place-items-center rounded-lg text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4Z" />
          </svg>
        </span>
        <span className="text-sm font-bold tracking-tight text-ink-2">go2read</span>
      </div>

      <div className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-strong bg-surface shadow-[var(--shadow-card)]">
          {link.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-52 w-full object-cover" />
          ) : (
            <div aria-hidden className="accent-line grid h-52 w-full place-items-center text-4xl text-white/90">🔗</div>
          )}
          <div className="p-5 text-center">
            <h1 className="text-xl font-bold tracking-tight">{link.title ?? "即將前往"}</h1>
            {link.description && <p className="mt-2 line-clamp-3 text-sm text-ink-2">{link.description}</p>}
            {sourceHost && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-3">
                即將前往 <span className="font-medium text-ink-2">{sourceHost}</span>
              </p>
            )}
            <ContinueButton code={link.code} sourceUrl={link.sourceUrl} affiliateUrl={link.affiliateUrl} />
            {/* 揭露：中性、低調但仍可讀地告知含合作連結與另開頁面行為（合規底線；不偽裝、不誇張、不點名平台） */}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              本頁含合作推廣連結；點「繼續」會前往原始來源，並可能另開相關頁面。
            </p>
          </div>
        </div>
      </div>

      <p className="relative mb-2 mt-auto pt-8 text-[11px] text-ink-3">由 go2read 提供安全中轉</p>
    </div>
  );
}
