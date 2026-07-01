// R2-E 多帳號農場偵測（唯讀，供管理員人工審查）：列出「疑似用多帳號規避贊助」的使用者與判定原因。
// 刻意不提供一鍵懲罰按鈕——是否處置由管理員個案判斷（避免誤傷真實多品牌經營者）。
export interface FarmSuspectRow {
  ownerEmail: string;
  accountCount: number;
  evasiveCount: number; // 永久不抽＋罰則＋封鎖
  ownerDebt: number;
  reasons: string[];
}

export default function AdminFarmPanel({ rows }: { rows: FarmSuspectRow[] }) {
  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">疑似多帳號農場（人工審查）</div>
      <p className="mb-2 text-xs text-ink-2">
        依「帳號數 × 規避傾向（永久不抽／違規罰則／黑名單／欠抽）」聚合標示，僅供人工審查參考——
        不會自動處置（避免誤傷真實多品牌經營者）。未偵測到裝置/IP 指紋，判定純基於贊助行為。
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-3">目前沒有可疑帳號群。</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={`${r.ownerEmail}-${i}`} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium" translate="no">{r.ownerEmail}</span>
                <span className="text-xs text-ink-3">
                  {r.accountCount} 帳號・規避 {r.evasiveCount}・欠抽 {r.ownerDebt}
                </span>
              </div>
              <ul className="mt-1 list-disc pl-5 text-xs text-ink-2">
                {r.reasons.map((reason, j) => (
                  <li key={j}>{reason}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
