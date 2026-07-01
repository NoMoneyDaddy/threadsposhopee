import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";

export const metadata: Metadata = { title: "贊助文規則 — IwantPo" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
  </section>
);

// 公開的「贊助文」規則頁（介面標示「此則將被納入贊助文」時連到這裡）。
export default function SponsoredPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-7 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">贊助文規則</h1>
        <p className="text-sm text-ink-3">最後更新：2026-07-01</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">
        本服務以「贊助文」支應免費使用。機制<strong className="text-ink">公開透明</strong>：以下完整說明如何選取、如何標示、如何查詢，
        以及依貢獻的回饋。使用本服務即表示你了解並同意以下規則。
      </p>

      <Section title="運作方式（比例制）">
        <p>
          發文帳號（<strong className="text-ink">網站管理者帳號除外</strong>）在發布<strong className="text-ink">你自己的</strong>貼文時，
          系統會依你<strong className="text-ink">當日實際發文量</strong>抽取<strong className="text-ink">少數幾篇</strong>（「每數篇抽 1 篇」，
          預設約每 6 篇 1 篇、每日至少 1 篇），把該篇<strong className="text-ink">貼文的分潤連結</strong>暫時替換為平台的蝦皮分潤連結後發布，
          <strong className="text-ink">其餘文案內容不變</strong>。抽取不限時段。
        </p>
        <p>
          <strong className="text-ink">低頻使用者友善</strong>：當日發文量低於門檻者<strong className="text-ink">完全不抽</strong>；
          系統<strong className="text-ink">不會把管理員或他人的內容貼到你的帳號</strong>，贊助文一律取自你自己原本要發的貼文。
          贊助文<strong className="text-ink">不影響</strong>發文節奏／防封機制（間隔、每日上限、抖動照常）。
        </p>
      </Section>

      <Section title="事前標示與自選">
        <p>
          你可在草稿介面<strong className="text-ink">自行指定</strong>某一篇作為當期贊助文（卡片會明確標示「★ 贊助文」）；
          未自選時，系統會在達配額時自動選取你當下要發的貼文。
        </p>
      </Section>

      <Section title="依貢獻的回饋">
        <p>
          你在共享庫分享的商品被越多人匯入，<strong className="text-ink">貢獻分數</strong>越高，贊助回饋越好：
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">未達門檻</strong>：貢獻越高，抽取比例<strong className="text-ink">自動遞減</strong>（抽越少）。</li>
          <li><strong className="text-ink">貢獻達 20</strong>：可在共享庫選擇<strong className="text-ink">「免每日贊助文」</strong>，完全不被抽。</li>
          <li><strong className="text-ink">貢獻達 60</strong>：可選擇<strong className="text-ink">「換成自己的分潤連結」</strong>——每日保底篇仍走平台（平台保本），超過保底的贊助篇改用你自己的蝦皮連結（分潤歸你）。</li>
        </ul>
      </Section>

      <Section title="連結鎖定">
        <p>
          被選為贊助文的該篇貼文，其分潤連結<strong className="text-ink">不可由使用者修改或移除</strong>；
          其他文字內容不受影響。
        </p>
      </Section>

      <Section title="臨時禁用（活動檔期）">
        <p>
          有商業合作或活動檔期時，你可到<strong className="text-ink">「設定 → 贊助文（各帳號）」</strong>把某帳號的贊助文
          <strong className="text-ink">臨時禁用</strong>一段期間（最長 60 天），到期<strong className="text-ink">自動恢復</strong>——不必完全暫停該帳號發文。
        </p>
      </Section>

      <Section title="透明與查詢">
        <p>
          你可隨時在<strong className="text-ink">「設定 → 贊助文（各帳號）」</strong>查看每個帳號<strong className="text-ink">今日已當贊助文的篇數</strong>與目前狀態；
          草稿卡也會即時標示哪一篇會成為贊助文。
        </p>
      </Section>

      <Section title="驗證與暫停（寬鬆處理）">
        <p>
          系統會驗證贊助文已成功發布、且其分潤連結未被竄改或刪除。偶發或單次被刪除/更動，
          系統<strong className="text-ink">只會記錄並提醒</strong>，不會立即暫停；
          僅在<strong className="text-ink">累計多次違規</strong>時，才會暫停該 Threads 帳號的自動發文，
          恢復走帳號管理的手動啟用。（選「換成自己連結」的自賺篇不在驗證範圍。）
        </p>
      </Section>

      <Section title="範圍與變更">
        <p>管理者本人的帳號不適用本規則。本規則以本頁最新版本為準。</p>
      </Section>

      {/* 低干擾廣告：僅置於公開內容頁底部（非操作流程/交易頁），未設 AdSense 則不顯示 */}
      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_CONTENT} className="mt-4" />
    </div>
  );
}
