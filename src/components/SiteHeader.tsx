"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/compose", label: "快速發文" },
  { href: "/", label: "儀表板" },
  { href: "/sources", label: "監看來源" },
  { href: "/materials", label: "素材庫" },
  { href: "/drafts", label: "文案佇列" },
  { href: "/calendar", label: "排程總覽" },
  { href: "/insights", label: "成效統計" },
  { href: "/accounts", label: "帳號管理" }
];

// Threads 風頂部導覽：黏性、毛玻璃、單色高對比，當前頁以實心膠囊標示。
export default function SiteHeader({
  user,
  isDemo
}: {
  user: { email: string | null; isOwner: boolean } | null;
  isDemo: boolean;
}) {
  const pathname = usePathname();
  const items = NAV.filter((n) => n.href !== "/sources" || user?.isOwner);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2" aria-label="ThreadsPoShopee 首頁">
            <span
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-xl bg-ink text-[17px] font-bold leading-none text-bg"
            >
              @
            </span>
            <span className="text-[15px] font-bold tracking-tight">
              <span className="text-brand">ThreadsPo</span>
              <span className="text-ink">Shopee</span>
            </span>
          </Link>
          {isDemo && <span className="badge-warn">Demo 模式</span>}
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
              const active = isActive(n.href);
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
              {user.isOwner && <span className="badge-brand">owner</span>}
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
