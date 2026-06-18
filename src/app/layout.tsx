import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { isDemoMode } from "@/lib/env";

export const metadata: Metadata = {
  title: "ThreadsPoShopee 控制台",
  description: "自動在 Threads 發佈 Shopee 分潤文案 — 多帳號、排程、AI 文案"
};

const nav = [
  { href: "/", label: "儀表板" },
  { href: "/sources", label: "監看來源" },
  { href: "/materials", label: "素材庫" },
  { href: "/drafts", label: "文案佇列" },
  { href: "/accounts", label: "帳號管理" }
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="min-h-screen">
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-shopee">ThreadsPo</span>
                <span className="text-lg font-bold">Shopee</span>
                {isDemoMode && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    Demo 模式（未連接金鑰）
                  </span>
                )}
              </div>
              <nav className="flex gap-1 text-sm">
                {nav.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
