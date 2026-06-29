"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; ownerOnly?: boolean };

// 文章管理的次導覽：把發文、草稿、AI 部落客、素材、自動抓文整併在同一個頁面群組底下。
const TABS: Tab[] = [
  { href: "/pipeline", label: "工作台" },
  { href: "/drafts", label: "草稿" },
  { href: "/compose", label: "發文" },
  { href: "/agents", label: "AI 部落客" },
  { href: "/materials", label: "素材" },
  { href: "/shared", label: "共享庫" },
  { href: "/sources", label: "抓文生素材", ownerOnly: true }
];

export default function ContentTabs({ isOwner }: { isOwner: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = TABS.filter((t) => !t.ownerOnly || isOwner);
  return (
    <nav className="-mx-1 mb-4 flex items-center gap-1 overflow-x-auto px-1" aria-label="文章管理次導覽">
      {tabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={
              "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors " +
              (active ? "bg-brand text-white" : "bg-surface-2 text-ink-2 hover:bg-neutral-200 hover:text-ink")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
