import type { Metadata } from "next";

export const metadata: Metadata = { title: "贊助文章規則 — IwantPo" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
  </section>
);

// 公開的「贊助文章」規則頁（介面標示「此則將被納入贊助文章」時連到這裡）。
export default function SponsoredPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-7 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">贊助文章規則</h1>
        <p className="text-sm text-ink-3">最後更新：2026-06-21</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">
        本服務以「贊助文章」支應免費使用。使用本服務即表示你了解並同意以下規則。
      </p>

      <Section title="運作方式">
        <p>
          每個發文帳號（<strong className="text-ink">網站管理者帳號除外</strong>）每天會有
          <strong className="text-ink"> 1 篇</strong>貼文，於冷門時段以「平台分潤連結」發布：系統會把該篇
          <strong className="text-ink">待發草稿的分潤連結</strong>暫時替換為平台的蝦皮分潤連結後發布，
          <strong className="text-ink">其餘文案內容不變</strong>。
        </p>
      </Section>

      <Section title="事前標示">
        <p>
          系統會在網站介面上<strong className="text-ink">明確標示</strong>哪一則將被納入贊助文章，你可事先得知。
        </p>
      </Section>

      <Section title="連結鎖定">
        <p>
          被選為贊助文章的該篇貼文，其分潤連結<strong className="text-ink">不可由使用者修改或移除</strong>；
          其他文字內容不受影響。
        </p>
      </Section>

      <Section title="驗證與暫停">
        <p>
          系統會驗證贊助文章已成功發布、且其分潤連結未被竄改或刪除。若偵測到該篇被刪除或連結被更動，
          將<strong className="text-ink">暫停該 Threads 帳號的自動發文</strong>，待下一篇贊助文章正常發布後自動恢復。
        </p>
      </Section>

      <Section title="範圍與變更">
        <p>管理者本人的帳號不適用本規則。本規則以本頁最新版本為準。</p>
      </Section>
    </div>
  );
}
