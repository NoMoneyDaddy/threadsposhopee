import type { SponsorRecordView } from "@/lib/store";

// 管理頁贊助文紀錄總覽（owner 限定，唯讀）：近期各帳號發布的贊助文與驗證狀態。
// 純展示元件（server component）：時間已在 server 端格式化為台北時間，避免 client TZ/hydration 差異。
export default function AdminSponsorPanel({ records }: { records: SponsorRecordView[] }) {
  return (
    <div className="card p-4">
      <h2 className="mb-1 text-lg font-semibold">贊助文紀錄</h2>
      <p className="mb-3 text-sm text-ink-2">近期各帳號發布的贊助文與驗證狀態（最多 50 筆）。違規＝連結被竄改或未依規範。</p>
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
                <th className="py-1.5 font-medium">狀態</th>
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
                  <td className={`py-2 ${r.statusTone}`}>{r.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
