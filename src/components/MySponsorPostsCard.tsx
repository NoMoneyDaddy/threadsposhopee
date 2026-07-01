// 我的贊助文（透明化）：列出目前哪個帳號的哪幾篇是贊助文、用哪個連結、驗證狀態。純展示（server 端組資料）。
export interface MySponsorPostRow {
  accountLabel: string;
  postId: string;
  link: string;
  atText: string;
  statusLabel: string;
  statusTone: string; // CSS class
}

export default function MySponsorPostsCard({ rows }: { rows: MySponsorPostRow[] }) {
  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">我的贊助文（透明紀錄）</div>
      <p className="mb-2 text-xs text-ink-2">
        以下是系統實際將你哪幾篇貼文用平台分潤連結發布的完整紀錄（哪個帳號、哪篇、用哪個連結、驗證狀態）。
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">目前還沒有贊助文紀錄。</p>
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
