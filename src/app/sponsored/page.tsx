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

      <Section title="貢獻分數怎麼算（重質）">
        <p>
          分數＝<strong className="text-ink">被匯入次數 ×3</strong>（別人真的把你分享的商品拿去用）＋
          <strong className="text-ink">優質素材 ×5</strong>（你分享中、被匯入 ≥ 3 次的素材數）＋資料紅利。
          <strong className="text-ink">不看分享數量、只看被使用的品質</strong>，避免灌水。
        </p>
      </Section>

      <Section title="四級階梯（徽章＝贊助回饋）">
        <p>貢獻越高，贊助文抽成越少；達頂級還能換成自己的連結自賺。平台保底永不歸零（見上）。</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>🌱 <strong className="text-ink">新手（0–14）</strong>：約每 6 篇抽 1。</li>
          <li>✨ <strong className="text-ink">貢獻者（15–39）</strong>：約每 12 篇抽 1。</li>
          <li>🏅 <strong className="text-ink">高貢獻（40–99）</strong>：約每 30 篇抽 1。</li>
          <li>👑 <strong className="text-ink">頂級（100＋）</strong>：每 60 篇抽 1（平台保底）＋可<strong className="text-ink">換成自己連結自賺</strong>（保底篇仍走平台）。</li>
        </ul>
        <p>
          你的即時進度（目前級別、抽成比例、距下一級還差幾分）顯示在<strong className="text-ink">共享庫</strong>頁；貢獻排行榜也在同頁，持續鼓勵上傳好素材。
        </p>
      </Section>

      <Section title="連結鎖定">
        <p>
          被選為贊助文的該篇貼文，其分潤連結<strong className="text-ink">不可由使用者修改或移除</strong>；
          其他文字內容不受影響。
        </p>
      </Section>

      <Section title="禁用與檔期（可臨時或永久）">
        <p>
          有商業合作或活動檔期時，你可到<strong className="text-ink">「設定 → 贊助文（各帳號）」</strong>把某帳號調整為
          <strong className="text-ink">「完全不抽」</strong>或<strong className="text-ink">「只抽一半」</strong>，可選<strong className="text-ink">臨時（最長 60 天、到期自動恢復）</strong>
          或<strong className="text-ink">永久</strong>；隨時可手動恢復。
        </p>
        <p>
          <strong className="text-ink">永久「完全不抽」的配套</strong>：該帳號原本應分擔的贊助文份額，會<strong className="text-ink">自動轉由你的其他帳號代為分擔</strong>
          （平台的整體份額不因單一帳號永久退出而歸零）。<strong className="text-ink">若其他帳號也沒發文/低頻、遲遲無法分擔，累積到上限時，該永久禁用帳號會「恢復被抽」以補還</strong>
          （並通知你）——確保平台一定收得到、不被永久搭便車；要停止，請讓其他帳號正常發文分擔，或改為「只抽一半」。
        </p>
      </Section>

      <Section title="透明與查詢">
        <p>
          你可隨時在<strong className="text-ink">「設定 → 贊助文（各帳號）」</strong>查看每個帳號<strong className="text-ink">今日已當贊助文的篇數</strong>與目前狀態；
          草稿卡也會即時標示哪一篇會成為贊助文。
        </p>
      </Section>

      <Section title="可自行隱藏／刪除貼文">
        <p>
          你在 Threads 的貼文<strong className="text-ink">隨時可自行隱藏或刪除</strong>（例如蝦皮政策變動需臨時下架）——
          我們不會鎖住你的 Threads 帳號。一般貼文完全不受影響；<strong className="text-ink">贊助文整篇被刪除/隱藏也視為正當下架，只記錄、不計違規</strong>。
        </p>
      </Section>

      <Section title="驗證與處罰（寬鬆、分級）">
        <p>
          系統只驗證<strong className="text-ink">「貼文仍在、但分潤連結被移除或竄改」</strong>這種情況（蓄意違規）；整篇被刪除視為正當下架、不罰。
          處罰採<strong className="text-ink">分級</strong>：偶發或單次只<strong className="text-ink">記錄並提醒</strong>；累計達門檻進入
          <strong className="text-ink">加重抽成期（約 14 天，帳號照常發文、到期自動恢復）</strong>；唯有<strong className="text-ink">持續竄改</strong>才會
          暫停該帳號發文（最後手段，恢復走帳號管理手動啟用）。（選「換成自己連結」的自賺篇不在驗證範圍。）
        </p>
      </Section>

      <Section title="內容責任與防護">
        <p>
          贊助文的<strong className="text-ink">文字內容仍是你自己的</strong>，請遵守平台與蝦皮規範。系統會對
          <strong className="text-ink">明顯違規/高風險內容</strong>（成人、賭博、詐騙等）<strong className="text-ink">自動略過贊助</strong>
          （不套平台連結），管理員也可將濫用帳號<strong className="text-ink">排除贊助</strong>，以保護平台與大家的分潤帳號不被連累檢舉。
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
