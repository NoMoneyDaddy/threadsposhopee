import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { isDemoMode } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "ThreadsPoShopee 控制台",
  description: "自動在 Threads 發佈 Shopee 分潤文案 — 多帳號、排程、AI 文案"
};

const nav = [
  { href: "/compose", label: "快速發文" },
  { href: "/", label: "儀表板" },
  { href: "/sources", label: "監看來源" },
  { href: "/materials", label: "素材庫" },
  { href: "/drafts", label: "文案佇列" },
  { href: "/calendar", label: "排程總覽" },
  { href: "/accounts", label: "帳號管理" }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="zh-Hant">
      <body>
        <div className="min-h-screen">
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-shopee">ThreadsPo</span>
                <span className="text-lg font-bold">Shopee</span>
                {isDemoMode && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                    Demo 模式（未連接金鑰）
                  </span>
                )}
                {user && (
                  <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500 sm:hidden">
                    {user.isOwner && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">owner</span>}
                    <form action="/auth/signout" method="post">
                      <button className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100">登出</button>
                    </form>
                  </span>
                )}
              </div>
              <nav className="flex items-center gap-1 overflow-x-auto text-sm">
                {user &&
                  nav
                    .filter((n) => n.href !== "/sources" || user.isOwner)
                    .map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      {n.label}
                    </Link>
                  ))}
                {user && (
                  <span className="ml-2 hidden shrink-0 items-center gap-2 border-l pl-3 text-xs text-neutral-500 sm:flex">
                    <span className="max-w-[12rem] truncate">{user.email}</span>
                    {user.isOwner && <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-700">owner</span>}
                    <form action="/auth/signout" method="post">
                      <button className="rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100">登出</button>
                    </form>
                  </span>
                )}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
