"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
// 導覽項目「一律常駐顯示」（不收合成漢堡）：桌機橫列靠右，手機螢幕不夠寬時自動換行，
// 永遠看得到所有分頁，省去先點漢堡再展開的麻煩。
export default function SiteHeader({
  user,
  isDemo
}: {
  user: { email: string | null; isOwner: boolean } | null;
  isDemo: boolean;
}) {
  const pathname = usePathname() ?? "";

  const items = NAV.filter((n) => !n.ownerOnly || user?.isOwner);
  const isActive = (n: NavItem) => isNavItemActive(n, pathname);

  const userMeta = user && (
    <>
      {/* translate="no"：email 是識別字，避免 Google 翻譯把它包成可點的虛線 token（看起來像超連結） */}
      <span translate="no" className="max-w-[12rem] truncate">{user.email}</span>
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
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
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

          {/* 導覽常駐顯示（不收合）：桌機靠右一列，手機螢幕不夠寬時自動換行 */}
          {user && (
            <nav className="ml-auto flex flex-wrap items-center gap-x-0.5 gap-y-1.5 text-sm" aria-label="主導覽">
              {items.map((n) => {
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
              {/* 極窄螢幕：允許使用者資訊自行換行；左邊框/左距僅 sm 以上才加，避免折行時邊框懸空 */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3 sm:ml-1 sm:border-l sm:border-border sm:pl-2">
                {userMeta}
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
