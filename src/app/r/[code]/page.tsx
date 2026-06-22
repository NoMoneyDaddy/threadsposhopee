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

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-10">
      <div className="card-p text-center">
        {link.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={link.imageUrl} alt="" loading="lazy" className="mb-4 h-40 w-full rounded-xl object-cover" />
        )}
        <h1 className="text-xl font-bold tracking-tight">{link.title ?? "即將前往"}</h1>
        {link.description && <p className="mt-2 text-sm text-ink-2">{link.description}</p>}

        <ContinueButton code={link.code} sourceUrl={link.sourceUrl} affiliateUrl={link.affiliateUrl} />

        {/* 揭露：中性、低調但仍可讀地告知含合作連結與另開頁面行為（合規底線；不偽裝、不誇張、不點名平台） */}
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          本頁含合作推廣連結；點「繼續」會前往原始來源，並可能另開相關頁面。
        </p>
      </div>
    </div>
  );
}
