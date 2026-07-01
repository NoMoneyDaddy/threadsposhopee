// 全站近期贊助文（透明化）：讓所有使用者了解「哪些貼文被作為平台贊助文」。
// 純展示（server 端組資料），只列公開資訊（發文時間、貼文連結、驗證狀態），不含發文者身分。
export interface SiteSponsorPostRow {
  postId: string;
  link: string;
  atText: string;
  verified: boolean;
}

export default function SiteSponsorPostsCard({ rows }: { rows: SiteSponsorPostRow[] }) {
  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">全站近期贊助文（透明）</div>
      <p className="mb-2 text-xs text-ink-2">
        平台以「贊助文」支應免費使用。以下是近期被作為平台贊助文的貼文（公開透明，不顯示發文者），讓大家了解機制實際如何運作。
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">目前還沒有贊助文紀錄。</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={`${r.postId}-${i}`} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className="text-xs text-ink-3">{r.atText}</span>
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-brand hover:underline"
                >
                  查看貼文連結
                </a>
              </div>
              <span className={"shrink-0 text-xs " + (r.verified ? "text-ink-3" : "text-amber-600")}>
                {r.verified ? "已驗證" : "待驗證"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
