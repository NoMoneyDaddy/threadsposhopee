import type { Metadata } from "next";

export const metadata: Metadata = { title: "隱私權政策 — IwantPo" };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-base font-semibold text-ink">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-ink-2">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-7 py-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">隱私權政策</h1>
        <p className="text-sm text-ink-3">最後更新：2026-06-20</p>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">
        本服務是一套協助你把商品分潤連結排程發布到你<strong className="text-ink">自有 Threads 帳號</strong>的第三方工具，
        與 Shopee、Meta／Threads 無任何官方關係或授權。本政策說明我們蒐集哪些資料、如何使用與保護。
      </p>

      <Section title="我們蒐集的資料">
        <ul className="list-disc space-y-1 pl-5">
          <li>帳號識別：你以 Google 登入時取得的 email（用於識別你的帳號）。</li>
          <li>你自行綁定的服務憑證：Threads 存取權杖、Shopee／Gemini／Apify 金鑰、Cloudinary 設定、通知用 Telegram chat_id。</li>
          <li>你建立的內容：素材、AI 文案草稿、排程與發布紀錄。</li>
        </ul>
      </Section>

      <Section title="如何保護">
        <p>
          所有機密憑證（權杖／金鑰）一律以 <strong className="text-ink">AES-256-GCM 加密</strong>後才存入資料庫，
          前端永遠取不到明文。資料以應用層的擁有者隔離，僅你本人可存取自己的資料。
        </p>
      </Section>

      <Section title="如何使用">
        <p>
          蒐集的資料僅用於提供本服務的功能：產生文案、依你授權發文到你的 Threads 帳號、排程、成效統計與通知。
          我們<strong className="text-ink">不販售、不出租</strong>你的個人資料，也不會用於本服務以外的用途。
        </p>
      </Section>

      <Section title="第三方服務">
        <p>
          為提供功能，資料會傳輸至你所綁定／本服務所使用的供應商：Supabase（資料庫與登入）、Google（登入）、
          Meta／Threads（發文）、Shopee（分潤連結）、Google Gemini（AI 文案）、Apify（來源擷取）、Cloudinary（媒體）。
          這些供應商各有其隱私政策，使用其服務即受其政策規範。媒體檔案上傳至你自綁的 Cloudinary。
        </p>
      </Section>

      <Section title="Cookie">
        <p>僅使用維持登入狀態所必需的 session cookie，不用於追蹤廣告。</p>
      </Section>

      <Section title="資料保存與刪除">
        <p>資料保存至你移除為止。解除綁定即刪除對應憑證；停用帳號即刪除你的資料。</p>
      </Section>

      <Section title="政策變更">
        <p>本政策可能隨功能調整而更新，最新版本以本頁為準。</p>
      </Section>
    </div>
  );
}
