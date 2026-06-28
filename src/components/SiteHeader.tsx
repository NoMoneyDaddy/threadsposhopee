"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string; match?: string[]; ownerOnly?: boolean };

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

// 當前頁高亮判斷（純函式、可單測）：首頁需完全相等；其餘需完全相等或為其子路徑（下一字元是 /），
// 以免 /links-archive、/drafts-old 這類兄弟路徑被誤判為 active。
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const all = item.match ?? [item.href];
  return all.some((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`)));
}

// Threads 風頂部導覽：黏性、毛玻璃、單色高對比，當前頁以實心膠囊標示。
// 桌機橫列；手機收合成漢堡選單（避免項目被擠出畫面外、提升發現性）。
export default function SiteHeader({
  user,
  isDemo
}: {
  user: { email: string | null; isOwner: boolean } | null;
  isDemo: boolean;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  // 換頁後自動收起手機選單。
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const items = NAV.filter((n) => !n.ownerOnly || user?.isOwner);
  const isActive = (n: NavItem) => isNavItemActive(n, pathname);

  const userMeta = user && (
    <>
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
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-2.5">
        <div className="flex items-center gap-2.5">
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

          {/* 桌機：橫列導覽（靠右） */}
          <nav className="ml-auto hidden items-center gap-0.5 text-sm lg:flex" aria-label="主導覽">
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
              <div className="ml-2 flex shrink-0 items-center gap-2 border-l border-border pl-3 text-xs text-ink-3">
                {userMeta}
              </div>
            )}
          </nav>

          {/* 手機：漢堡按鈕 */}
          {user && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "關閉選單" : "開啟選單"}
              className="btn btn-ghost btn-sm ml-auto lg:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          )}
        </div>

        {/* 手機：收合選單內容 */}
        {user && open && (
          <nav id="mobile-nav" className="mt-2 flex flex-col gap-0.5 text-sm lg:hidden" aria-label="主導覽">
            {items.map((n) => {
              const active = isActive(n);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-lg px-3 py-2 font-medium transition-colors " +
                    (active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink")
                  }
                >
                  {n.label}
                </Link>
              );
            })}
            <div className="mt-1 flex items-center gap-2 border-t border-border pt-2 text-xs text-ink-3">
              {userMeta}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
