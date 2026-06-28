"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import ProductTour from "./ProductTour";

// 主站外框（頂部導覽＋頁尾）。go2read 中轉頁（/r/*）是獨立子服務，
// 不套主站品牌/導覽，整頁全幅交由該頁自行排版。
// tour：登入後掛載互動導覽（首次自動開一次；可由「使用說明」頁手動重開）。
export default function AppChrome({ header, children, tour = false }: { header: ReactNode; children: ReactNode; tour?: boolean }) {
  const pathname = usePathname();
  const bare = pathname?.startsWith("/r/") ?? false;
  if (bare) return <>{children}</>;
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-ink-3 sm:flex-row sm:justify-between sm:text-left">
          <p>本服務為自有的第三方發文工具，與 Shopee、Meta／Threads 無任何官方關係或授權。</p>
          <nav className="flex items-center gap-4" aria-label="頁尾">
            <a href="/how-it-works" className="hover:text-ink">使用說明</a>
            <a href="/guide" className="hover:text-ink">金鑰教學</a>
            <a href="/privacy" className="hover:text-ink">隱私權政策</a>
            <a href="/terms" className="hover:text-ink">服務條款</a>
            <a href="/sponsored" className="hover:text-ink">贊助文規則</a>
            <a href="/feedback" className="hover:text-ink">意見回饋</a>
          </nav>
        </div>
      </footer>
      {tour && <ProductTour auto />}
    </div>
  );
}
