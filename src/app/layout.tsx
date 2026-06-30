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
import ViewAsBar from "@/components/ViewAsBar";
import PwaRegister from "@/components/PwaRegister";
import SessionSync from "@/components/SessionSync";

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
  // 關閉行動裝置（iOS/Android）對 email／電話／地址／日期的自動偵測，
  // 否則畫面上的 email（header、view-as 列、管理面板）等會被加上可點的虛線框。
  formatDetection: { telephone: false, date: false, address: false, email: false },
  // 本站為繁中專用：請瀏覽器（Chrome/Google 翻譯）不要提供「翻譯此頁」。
  // 否則翻譯啟用後會在每段文字（含連結、email）加上「已翻譯」虛線底線，看起來像壞掉的超連結。
  other: {
    google: "notranslate",
    ...(ADSENSE_CLIENT ? { "google-adsense-account": ADSENSE_CLIENT } : {})
  }
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  // 明確指定行動裝置視窗（不依賴框架預設）；不鎖 maximum-scale／user-scalable，保留使用者主動縮放（a11y）。
  width: "device-width",
  initialScale: 1
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant" translate="no" className={display.variable}>
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
        {user && <SessionSync />}
        {user?.isPlatformOwner && <ViewAsBar viewingAsEmail={user.viewingAsEmail ?? null} />}
        <AppChrome
          autoTour={Boolean(user) && !isDemoMode}
          header={<SiteHeader user={user ? { email: user.email, isOwner: user.isOwner } : null} isDemo={isDemoMode} />}
        >
          {children}
        </AppChrome>
        <PwaRegister />
      </body>
    </html>
  );
}
