import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { isDemoMode } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import SiteHeader from "@/components/SiteHeader";

// Google AdSense（選用）：設了 NEXT_PUBLIC_ADSENSE_CLIENT（ca-pub-…）才啟用。
// 驗證走 google-adsense-account meta；載入器只在有設定時插入。建議只在公開頁放廣告單元。
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

export const metadata: Metadata = {
  title: "IwantPo 控制台",
  description: "多帳號社群排程發文工具 — 自動排程、AI 文案、分潤連結管理、防封節奏",
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {})
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant">
      <body>
        {ADSENSE_CLIENT && (
          <Script
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
        <div className="flex min-h-dvh flex-col">
          <SiteHeader user={user ? { email: user.email, isOwner: user.isOwner } : null} isDemo={isDemoMode} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
          <footer className="border-t border-border">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-ink-3 sm:flex-row sm:justify-between sm:text-left">
              <p>本服務為自有的第三方發文工具，與 Shopee、Meta／Threads 無任何官方關係或授權。</p>
              <nav className="flex items-center gap-4" aria-label="頁尾">
                <a href="/privacy" className="hover:text-ink">隱私權政策</a>
                <a href="/terms" className="hover:text-ink">服務條款</a>
                <a href="/sponsored" className="hover:text-ink">贊助文章規則</a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
