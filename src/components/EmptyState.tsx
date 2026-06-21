import Link from "next/link";

// 一致的空狀態：圖示＋標題＋說明＋（選填）行動鈕。降低新手「下一步做什麼」的茫然。
export default function EmptyState({
  icon = "📭",
  title,
  hint,
  cta
}: {
  icon?: string;
  title: string;
  hint?: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-2 font-medium text-ink-2">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">{hint}</p>}
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
