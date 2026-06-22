import type { Badge } from "@/lib/roles";

const TONE: Record<Badge["tone"], string> = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  warn: "bg-warn/10 text-warn"
};

// 榮譽勳章列（純展示）。size sm 用於卡片，md 用於個人區。
export default function BadgeRow({ badges, size = "sm" }: { badges: Badge[]; size?: "sm" | "md" }) {
  if (badges.length === 0) return null;
  const pad = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((b) => (
        <span key={b.key} className={`inline-flex items-center gap-1 rounded-full font-medium ${pad} ${TONE[b.tone]}`} title={b.label}>
          <span aria-hidden>{b.emoji}</span>
          {b.label}
        </span>
      ))}
    </div>
  );
}
