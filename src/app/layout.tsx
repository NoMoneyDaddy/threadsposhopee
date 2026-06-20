import type { Metadata } from "next";
import "./globals.css";
import { isDemoMode } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "ThreadsPoShopee 控制台",
  description: "自動在 Threads 發佈 Shopee 分潤文案 — 多帳號、排程、AI 文案"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant">
      <body>
        <div className="flex min-h-dvh flex-col">
          <SiteHeader user={user ? { email: user.email, isOwner: user.isOwner } : null} isDemo={isDemoMode} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
