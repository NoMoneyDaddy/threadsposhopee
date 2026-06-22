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
    <div className="rounded-2xl border border-dashed border-strong bg-surface/50 p-10 text-center">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-2">{hint}</p>}
      {cta && (
        <Link href={cta.href} className="btn btn-brand mt-5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
