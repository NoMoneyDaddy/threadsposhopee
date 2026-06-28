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
        <p className="text-sm text-ink-3">最後更新：2026-06-21</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">
        本服務以「贊助文」支應免費使用。使用本服務即表示你了解並同意以下規則。
      </p>

      <Section title="運作方式（比例制）">
        <p>
          發文帳號（<strong className="text-ink">網站管理者帳號除外</strong>）在發布<strong className="text-ink">你自己的</strong>貼文時，
          系統會依你<strong className="text-ink">當日實際發文量</strong>抽取其中一部分（「每數篇抽 1 篇」），把該篇
          <strong className="text-ink">貼文的分潤連結</strong>暫時替換為平台的蝦皮分潤連結後發布，
          <strong className="text-ink">其餘文案內容不變</strong>。
        </p>
        <p>
          <strong className="text-ink">低頻使用者友善</strong>：當日發文量低於門檻者<strong className="text-ink">完全不抽</strong>；
          系統<strong className="text-ink">不會把管理員或他人的內容貼到你的帳號</strong>，贊助文一律取自你自己原本要發的貼文。
        </p>
      </Section>

      <Section title="事前標示與自選">
        <p>
          你可在草稿介面<strong className="text-ink">自行指定</strong>某一篇作為當期贊助文（會明確標示）；
          未自選時，系統會在達配額時自動選取你當下要發的貼文。
        </p>
      </Section>

      <Section title="連結鎖定">
        <p>
          被選為贊助文的該篇貼文，其分潤連結<strong className="text-ink">不可由使用者修改或移除</strong>；
          其他文字內容不受影響。
        </p>
      </Section>

      <Section title="驗證與暫停（寬鬆處理）">
        <p>
          系統會驗證贊助文已成功發布、且其分潤連結未被竄改或刪除。偶發或單次被刪除/更動，
          系統<strong className="text-ink">只會記錄並提醒</strong>，不會立即暫停；
          僅在<strong className="text-ink">累計多次違規</strong>時，才會暫停該 Threads 帳號的自動發文，
          恢復走帳號管理的手動啟用。
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
