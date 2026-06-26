import type { ReactNode } from "react";

// 欄位說明/提示的統一樣式：
// - tone="muted"（預設）：一般輔助說明（灰字）。
// - tone="warn"：需提醒注意的風險（琥珀底，如「免審直接發文」「間隔過短易被封」）。
export function FieldHint({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" }) {
  if (tone === "warn") {
    return <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-700">{children}</p>;
  }
  return <p className="mt-1 text-xs text-ink-3">{children}</p>;
}
