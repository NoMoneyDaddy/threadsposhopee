import type { SponsorRecordView, SponsorShareSummary } from "@/lib/store";
import SponsorBlockButton from "@/components/SponsorBlockButton";

// 管理頁贊助文紀錄總覽（owner 限定）：份額彙總（平台 vs 貢獻者，僅管理員可見）＋近期紀錄＋封鎖濫用帳號。
export default function AdminSponsorPanel({
  records,
  summary,
  blockedIds = []
}: {
  records: SponsorRecordView[];
  summary?: SponsorShareSummary;
  blockedIds?: string[];
}) {
  const blocked = new Set(blockedIds);
  return (
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">贊助文紀錄</h2>
      {summary && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-ink-2">總計 {summary.total}</span>
          <span className="rounded-lg bg-green-50 px-2 py-1 text-green-700" title="走平台連結＝管理員收益來源（僅你可見）">平台份額 {summary.platform}</span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-ink-2">貢獻者自賺 {summary.contributor}</span>
          {summary.violated > 0 && <span className="rounded-lg bg-red-50 px-2 py-1 text-red-600">違規 {summary.violated}</span>}
          {summary.deleted > 0 && <span className="rounded-lg bg-surface-2 px-2 py-1 text-ink-3">已下架 {summary.deleted}</span>}
        </div>
      )}
      <p className="mb-3 text-sm text-ink-2">近期各帳號發布的贊助文與驗證狀態（最多 50 筆）。違規＝連結被竄改。可封鎖濫用帳號的贊助。</p>
      {records.length === 0 ? (
        <p className="text-sm text-ink-3">尚無贊助文紀錄。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-3">
                <th className="py-1.5 pr-2 font-medium">時間</th>
                <th className="py-1.5 pr-2 font-medium">擁有者</th>
                <th className="py-1.5 pr-2 font-medium">貼文</th>
                <th className="py-1.5 pr-2 font-medium">連結</th>
                <th className="py-1.5 pr-2 font-medium">狀態</th>
                <th className="py-1.5 font-medium">管理</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {records.map((r, i) => (
                <tr key={`${r.postId}-${i}`}>
                  <td className="whitespace-nowrap py-2 pr-2 text-ink-2">{r.atText}</td>
                  <td className="py-2 pr-2 break-all text-ink-2">{r.ownerEmail ?? "—"}</td>
                  <td className="py-2 pr-2 text-ink-3">{r.postId}</td>
                  <td className="max-w-[16rem] truncate py-2 pr-2">
                    <a href={r.link} target="_blank" rel="noopener" className="text-brand underline">
                      {r.link}
                    </a>
                  </td>
                  <td className={`py-2 pr-2 ${r.statusTone}`}>{r.statusLabel}</td>
                  <td className="py-2">
                    <SponsorBlockButton accountId={r.accountId} initialBlocked={blocked.has(r.accountId)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
