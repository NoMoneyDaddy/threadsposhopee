import Link from "next/link";

// 圖床比較（靜態說明）：強調「流量（egress）」差異——R2 流量永久免費，量大不爆；Cloudinary 流量吃共用額度。
// 故本服務預設「優先綁定 R2」。
export default function MediaHostCompare() {
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-medium text-ink">圖片／影片存放：選哪個？</h3>
        <span className="badge-success">建議優先 R2</span>
      </div>
      <p className="mb-3 text-xs text-ink-2">
        綁了 <b>R2 會優先使用</b>（兩者都綁也以 R2 為準）。重點差在<b>流量費</b>：R2 流量永久免費、量大也不會爆；
        Cloudinary 的流量會吃掉免費額度，發圖一多很快用完。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="text-left text-ink-2">
              <th className="border-b border-border py-1.5 pr-3 font-medium"> </th>
              <th className="border-b border-border py-1.5 pr-3 font-medium text-ink">Cloudflare R2 ⭐</th>
              <th className="border-b border-border py-1.5 font-medium">Cloudinary</th>
            </tr>
          </thead>
          <tbody className="text-ink">
            <tr>
              <td className="border-b border-border py-1.5 pr-3 text-ink-2">免費儲存</td>
              <td className="border-b border-border py-1.5 pr-3">10 GB／月</td>
              <td className="border-b border-border py-1.5">25 credits 共用（1GB=1 credit）</td>
            </tr>
            <tr>
              <td className="border-b border-border py-1.5 pr-3 text-ink-2">流量（egress）</td>
              <td className="border-b border-border py-1.5 pr-3 font-medium text-success">永久免費、不限量</td>
              <td className="border-b border-border py-1.5">算進 25 credits（1GB=1 credit），易爆</td>
            </tr>
            <tr>
              <td className="border-b border-border py-1.5 pr-3 text-ink-2">超量行為</td>
              <td className="border-b border-border py-1.5 pr-3">便宜計費（$0.015/GB 儲存、流量仍 $0）</td>
              <td className="border-b border-border py-1.5 text-warn">免費版超量會停用帳號（資產無法存取）</td>
            </tr>
            <tr>
              <td className="border-b border-border py-1.5 pr-3 text-ink-2">內建轉檔／最佳化</td>
              <td className="border-b border-border py-1.5 pr-3 text-ink-3">無（純儲存）</td>
              <td className="border-b border-border py-1.5">有（圖片/影片轉檔、最佳化、CDN）</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 text-ink-2">注意</td>
              <td className="py-1.5 pr-3 text-ink-3">r2.dev 免費網址有速率限制，正式上線建議綁自訂網域</td>
              <td className="py-1.5 text-ink-3">適合需要即時轉檔／最佳化者</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        想省流量、量大 → 選 <b>R2</b>；需要即時圖片轉檔最佳化 → 選 Cloudinary。設定步驟見{" "}
        <Link href="/guide#r2" className="text-brand underline">金鑰教學</Link>。
      </p>
    </div>
  );
}
