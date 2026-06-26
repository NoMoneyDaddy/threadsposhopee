import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { isDemoMode } from "@/lib/env";

// Display 字體（標題與數字）：幾何 grotesk 給控制台「數據感」記憶點；中文由 CSS 字體堆疊 fallback。
const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-display", display: "swap" });
import { getCurrentUser } from "@/lib/auth";
import SiteHeader from "@/components/SiteHeader";
import AppChrome from "@/components/AppChrome";
import PwaRegister from "@/components/PwaRegister";

// Google AdSense（選用）：設了 NEXT_PUBLIC_ADSENSE_CLIENT（ca-pub-…）才啟用。
// 驗證走 google-adsense-account meta；載入器只在有設定時插入。建議只在公開頁放廣告單元。
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";

// 網站分析（選用、免費、無 cookie）：設了 NEXT_PUBLIC_ANALYTICS_SRC 才載入。
// 建議自架 Umami 或 Plausible（cookieless、GDPR 友善）：SRC 填 script 網址，
// 若用 Umami 再填 NEXT_PUBLIC_ANALYTICS_ID（website-id）。未設定則完全不載入。
const ANALYTICS_SRC = process.env.NEXT_PUBLIC_ANALYTICS_SRC || "";
const ANALYTICS_ID = process.env.NEXT_PUBLIC_ANALYTICS_ID || "";

export const metadata: Metadata = {
  title: "IwantPo 控制台",
  description: "多帳號社群排程發文工具 — 自動排程、AI 文案、分潤連結管理、防封節奏",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "IwantPo" },
  ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {})
};

export const viewport: Viewport = {
  themeColor: "#6366f1"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant" className={display.variable}>
      <body>
        {ADSENSE_CLIENT && (
          <Script
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
          />
        )}
        {ANALYTICS_SRC && (
          <Script
            defer
            strategy="afterInteractive"
            src={ANALYTICS_SRC}
            {...(ANALYTICS_ID ? { "data-website-id": ANALYTICS_ID } : {})}
          />
        )}
        <AppChrome header={<SiteHeader user={user ? { email: user.email, isOwner: user.isOwner } : null} isDemo={isDemoMode} />}>
          {children}
        </AppChrome>
        <PwaRegister />
      </body>
    </html>
  );
}
