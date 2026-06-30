// 帳號總覽列：多帳號時，一眼看出各發文帳號的負載分布（待審／已排／今日已發）與下一篇預計時間。
// 純展示（伺服器端算好傳入）；單一帳號時不顯示（無分布可言）。
export interface AccountOverviewRow {
  id: string;
  label: string;
  displayName: string | null;
  pending: number; // 待審草稿數
  approved: number; // 已排程（approved）數
  publishedToday: number; // 今日（台北）已發布數
  nextEtaIso: string | null; // 下一篇預計自動發文時間
}

export default function AccountsOverview({ rows }: { rows: AccountOverviewRow[] }) {
  if (rows.length <= 1) return null;
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";
  return (
    <div className="card p-4">
      <div className="mb-2 text-sm font-semibold text-ink">帳號總覽</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="min-w-0 rounded-xl border border-border bg-surface-2/40 p-3">
            <div className="truncate text-sm font-medium text-ink" translate="no" title={r.label}>
              {r.displayName || r.label}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-2 tabular-nums">
              <span>待審 {r.pending}</span>
              <span>已排 {r.approved}</span>
              <span>今日已發 {r.publishedToday}</span>
            </div>
            <div className="mt-1 truncate text-xs text-ink-3">下一篇：{fmt(r.nextEtaIso)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
