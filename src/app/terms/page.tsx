import type { Metadata } from "next";

export const metadata: Metadata = { title: "服務條款 — IwantPo" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-7 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">服務條款</h1>
        <p className="text-sm text-ink-3">最後更新：2026-06-20</p>
      </header>

      <Section title="服務說明">
        <p>
          本服務協助你把商品分潤連結與文案，依防封節奏排程發布到你<strong className="text-ink">自有的 Threads 帳號</strong>。
          本服務為獨立第三方工具，<strong className="text-ink">與 Shopee、Meta／Threads 無任何官方關係或授權</strong>。
          所有品牌與商標均屬其各自所有人。
        </p>
      </Section>

      <Section title="你的帳號與授權">
        <p>
          你自行貼上 Threads access token 並綁定各服務金鑰；你需確保有權使用這些帳號與金鑰，並為以本服務發布的所有內容負責。
        </p>
      </Section>

      <Section title="贊助文">
        <p>
          免費使用本服務即同意：發文帳號（管理者帳號除外）在發布你自己的貼文時，系統會依你當日實際發文量
          <strong className="text-ink">按比例抽取少數幾篇</strong>（約每數篇抽 1 篇、不限時段），把該篇貼文的分潤連結
          暫時替換為平台的分潤連結，<strong className="text-ink">其餘文案內容不變</strong>；貢獻越高抽越少，平台保底。
          當日發文量過低者不抽。系統會於網站介面事前標示，完整規則（含比例、貢獻分級、驗證與查詢）請見
          <a href="/sponsored" className="text-brand underline">《贊助文規則》</a>。
        </p>
      </Section>

      <Section title="合規使用">
        <ul className="list-disc space-y-1 pl-5">
          <li>你需遵守 Meta／Threads 與 Shopee 的服務條款、社群規範與分潤計畫政策。</li>
          <li>不得用於垃圾訊息、詐騙、冒名、散布違法或侵權內容。</li>
          <li>自動發文存在帳號被平台限制或停權的風險，你了解並自行承擔。</li>
        </ul>
      </Section>

      <Section title="免責聲明">
        <p>
          本服務按「現狀」提供，不保證發文必然成功、分潤必然計入、或帳號不被平台處置。
          在法律允許範圍內，本服務不對因使用（或無法使用）所生之任何損失負責。
        </p>
      </Section>

      <Section title="服務變更">
        <p>本服務得隨時新增、修改或停止部分或全部功能，並更新本條款，最新版本以本頁為準。</p>
      </Section>
    </div>
  );
}
