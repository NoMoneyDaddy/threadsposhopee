// 我的贊助文（透明化）：列出目前哪個帳號的哪幾篇是贊助文、用哪個連結、驗證狀態。純展示（server 端組資料）。
export interface MySponsorPostRow {
  accountLabel: string;
  postId: string;
  link: string;
  atText: string;
  statusLabel: string;
  statusTone: string; // CSS class
  rateText?: string | null; // 分潤率（如 "5%"）；查不到為 null
}

export default function MySponsorPostsCard({
  rows,
  title = "我的贊助文（透明紀錄）",
  intro = "以下是系統實際將你哪幾篇貼文用平台分潤連結發布的完整紀錄（哪個帳號、哪篇、用哪個連結、驗證狀態）。",
  emptyText = "目前還沒有贊助文紀錄。"
}: {
  rows: MySponsorPostRow[];
  title?: string;
  intro?: string;
  emptyText?: string;
}) {
  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">{title}</div>
      <p className="mb-2 text-xs text-ink-2">{intro}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={`${r.postId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium" translate="no">{r.accountLabel}</span>
                <span className="ml-2 text-xs text-ink-3">{r.atText}</span>
                <div className="truncate text-xs text-ink-3">
                  貼文 <span translate="no">{r.postId}</span>・
                  <a href={r.link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">連結</a>
                  {r.rateText ? <span className="ml-1">・分潤率 {r.rateText}</span> : null}
                </div>
              </div>
              <span className={"shrink-0 text-xs " + r.statusTone}>{r.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
