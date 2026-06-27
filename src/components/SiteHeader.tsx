"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; match?: string[]; ownerOnly?: boolean };

// 六大頁資訊架構（依使用流程排序、白話命名）。「文章管理」整併發文/草稿/AI部落客/素材/自動抓文。
const NAV: NavItem[] = [
  { href: "/", label: "儀表板" },
  { href: "/drafts", label: "文章管理", match: ["/drafts", "/compose", "/agents", "/materials", "/sources", "/shared", "/calendar"] },
  { href: "/links", label: "轉址服務" },
  { href: "/insights", label: "成效分析" },
  { href: "/accounts", label: "帳號管理" },
  { href: "/settings", label: "設定" },
  { href: "/admin", label: "管理", ownerOnly: true }
];

// Threads 風頂部導覽：黏性、毛玻璃、單色高對比，當前頁以實心膠囊標示。
export default function SiteHeader({
  user,
  isDemo
}: {
  user: { email: string | null; isOwner: boolean } | null;
  isDemo: boolean;
}) {
  const pathname = usePathname() ?? "";
  const items = NAV.filter((n) => !n.ownerOnly || user?.isOwner);
  const isActive = (n: NavItem) => {
    const all = n.match ?? [n.href];
    return all.some((h) => (h === "/" ? pathname === "/" : pathname.startsWith(h)));
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <Link href="/" className="flex items-center gap-2" aria-label="IwantPo 首頁">
            <span aria-hidden className="accent-line grid h-8 w-8 place-items-center rounded-xl text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </span>
            <span className="text-[15px] font-bold tracking-tight">
              <span className="text-ink">Iwant</span>
              <span className="text-brand">Po</span>
            </span>
          </Link>
          {isDemo && <span className="badge-warn whitespace-nowrap">Demo 模式（未連接金鑰）</span>}
          {user && (
            <form action="/auth/signout" method="post" className="ml-auto sm:hidden">
              <button className="btn btn-ghost btn-sm" type="submit">
                登出
              </button>
            </form>
          )}
        </div>

        <nav className="-mx-1 flex items-center gap-0.5 overflow-x-auto px-1 text-sm" aria-label="主導覽">
          {user &&
            items.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition-colors " +
                    (active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
          {user && (
            <span className="ml-2 hidden shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-ink-3 sm:flex">
              <span className="max-w-[12rem] truncate">{user.email}</span>
              {user.isOwner ? (
                <span className="badge-brand">管理者</span>
              ) : (
                <span className="rounded bg-surface-2 px-2 py-0.5 text-ink-2">成員</span>
              )}
              <form action="/auth/signout" method="post">
                <button className="btn btn-ghost btn-sm" type="submit">
                  登出
                </button>
              </form>
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}
