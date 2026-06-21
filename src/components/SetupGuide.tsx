import Link from "next/link";
import type { SetupStep } from "@/lib/setup-status";

// 新手引導卡牌：依目前使用者的設定完成度顯示步驟與進度。必填全完成後自動隱藏。
export default function SetupGuide({ steps }: { steps: SetupStep[] }) {
  const required = steps.filter((s) => s.required);
  const doneCount = required.filter((s) => s.done).length;
  if (required.length > 0 && doneCount === required.length) return null;
  const pct = required.length ? Math.round((doneCount / required.length) * 100) : 0;

  return (
    <section aria-label="設定指引" className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">🚀 開始設定（{doneCount}/{required.length} 完成）</h2>
        <span className="text-xs text-ink-3">🔒 只用你自己的金鑰，彼此不共用</span>
      </div>

      <div className="my-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className={`flex flex-col justify-between gap-2 rounded-xl border border-border p-3 ${s.done ? "bg-surface-2" : "bg-bg"}`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  s.done ? "bg-green-500 text-white" : "bg-surface-2 text-ink-2 ring-1 ring-border"
                }`}
                aria-hidden
              >
                {s.done ? "✓" : i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span>{s.title}</span>
                  {!s.required && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-3">選填</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{s.desc}</p>
              </div>
            </div>
            <div className="pl-7">
              {s.done ? (
                <span className="text-xs font-medium text-green-600">已完成</span>
              ) : (
                <Link
                  href={s.href}
                  className="inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                >
                  去設定
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
