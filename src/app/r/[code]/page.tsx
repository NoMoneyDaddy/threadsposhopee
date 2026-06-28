import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRedirectLinkByCode, bumpRedirectClick } from "@/lib/redirect-store";
import ContinueButton from "./ContinueButton";
import AdSlot from "@/components/AdSlot";

export const dynamic = "force-dynamic";

// 爬蟲/連結預覽抓取的 UA（FB/IG/Threads unfurl、各家 bot）。命中就不計入 clicks，
// 讓 clicks 趨近「真人瀏覽」；真正的導流意圖以「繼續」(continues) 為準。
// 通用詞已涵蓋多數爬蟲（bot→*bot、crawl→crawler、spider→*spider），其餘列出不含通用詞的特例。
const BOT_UA_RE = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp|embedly|pinterest|yandex|preview|headless/i;

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
  // 只計真人瀏覽：爬蟲/預覽抓取的 UA（FB/Threads unfurl、各家 bot）跳過，避免灌水。
  const ua = headers().get("user-agent") ?? "";
  if (!BOT_UA_RE.test(ua)) await bumpRedirectClick(params.code).catch(() => {}); // best-effort 計數，不擋頁

  // 來源網域（縮圖佔位用）＋來源網址縮略（顯示「即將前往哪裡」，增加信任感）。
  let sourceHost = "";
  let sourceDisplay = "";
  try {
    const u = new URL(link.sourceUrl);
    sourceHost = u.host.replace(/^www\./, "");
    const s = sourceHost + u.pathname + u.search;
    sourceDisplay = s.length > 42 ? `${s.slice(0, 42)}…` : s;
  } catch {
    /* 忽略無法解析的來源 */
  }

  // 安全標章：safe＝已過 Google Safe Browsing；unsafe＝命中威脅名單（醒目警告、不自動跳轉）；
  // null＝未設金鑰/查詢失敗的降級（仍已過 SSRF/協定白名單＝基本檢查通過）。
  const unsafe = link.safety === "unsafe";
  const safetyBadge =
    link.safety === "safe"
      ? { cls: "bg-emerald-50 text-emerald-700", text: "✓ 已通過安全檢查" }
      : link.safety === "unsafe"
        ? { cls: "bg-red-50 text-red-600", text: "⚠ 此連結可能不安全，請自行斟酌" }
        : { cls: "bg-surface-2 text-ink-3", text: "✓ 基本安全檢查通過" };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-surface-2 px-4 py-10">
      {/* 獨立導流子服務品牌（go2read），與主站分離 */}
      <header className="relative mb-6 flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="accent-line grid h-8 w-8 place-items-center rounded-xl text-white shadow-[var(--shadow-card)]">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4Z" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">go2read</span>
        </div>
        <p className="text-xs text-ink-3">安全中轉，前往你想看的內容</p>
      </header>

      <main className="relative w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-strong bg-surface shadow-[var(--shadow-card)]">
          {link.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-52 w-full object-cover" />
          ) : (
            <div aria-hidden className="accent-line flex h-44 w-full flex-col items-center justify-center gap-2 text-white/95">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span className="text-xs font-medium tracking-wide opacity-90">{sourceHost || "go2read"}</span>
            </div>
          )}
          <div className="p-5 text-center">
            <h1 className="text-xl font-bold leading-snug tracking-tight">{link.title ?? "即將前往"}</h1>
            {link.description && <p className="mt-2 line-clamp-3 text-sm text-ink-2">{link.description}</p>}
            {sourceDisplay && (
              <p className="mt-3 inline-flex max-w-full items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-ink-3">
                即將前往 <span className="truncate font-medium text-ink-2" title={link.sourceUrl}>{sourceDisplay}</span>
              </p>
            )}
            {/* 來源安全標章（增加信任度） */}
            <p className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${safetyBadge.cls}`}>
              {safetyBadge.text}
            </p>
            <ContinueButton code={link.code} sourceUrl={link.sourceUrl} unsafe={unsafe} />
            {/* 揭露：正規轉址服務，由廣告維運（中性、低調；不偽裝、不誇張） */}
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              go2read 為你安全中轉到目標頁面，本頁由廣告維護運轉。
            </p>
          </div>
        </div>

        {/* 低干擾廣告位（設定 NEXT_PUBLIC_ADSENSE_CLIENT＋slot 才顯示，未設不留空位） */}
        <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_REDIRECT} className="mt-4" />
      </main>

      <footer className="relative mt-8 text-[11px] text-ink-3">由 go2read 提供安全中轉</footer>
    </div>
  );
}
