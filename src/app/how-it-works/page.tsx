import Link from "next/link";
import type { ReactNode } from "react";
import TourLaunchButton from "@/components/TourLaunchButton";

export const dynamic = "force-static";

export const metadata = { title: "使用說明 — IwantPo" };

// 完整使用說明：這是什麼、怎麼運作、怎麼一步步用。對照 src/CLAUDE.md 的架構速覽。
// 金鑰怎麼取得另見 /guide；本頁聚焦「流程與運作原理」。

function Section({ id, title, badge, children }: { id: string; title: string; badge?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {badge && <span className="badge-neutral">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

// 步驟清單：items 直接吃 ReactNode，內部連結用 next/link 的 <Link> 走 client 端導航
// （避免原生 <a> 觸發整頁重載）。
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink [overflow-wrap:anywhere]">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-ink-2">💡 {children}</p>;
}

export default function HowItWorksPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">使用說明</h1>
        <p className="mt-1 text-sm text-ink-2">
          這頁說明 IwantPo 怎麼運作、怎麼一步步用。需要各服務金鑰的取得教學，請看{" "}
          <Link href="/guide" className="text-brand underline">金鑰取得教學</Link>。
        </p>
        <div className="mt-3">
          <TourLaunchButton />
        </div>
      </div>

      <Section id="what" title="這是什麼">
        <p className="text-sm text-ink [overflow-wrap:anywhere]">
          IwantPo 是一套<b>多帳號 Threads 排程發文工具</b>：把蝦皮商品連結變成「素材」（分潤連結＋AI 文案＋媒體），
          經你核准後，依<b>防封節奏</b>自動排程發到你的 Threads 帳號。整條龍含：選題／抓素材 → AI 寫文案 →
          換上你的分潤連結 → 人工核准 → 排程發布 → 留言補分潤連結 → 成效回灌。
        </p>
        <Note>
          本服務為自有的第三方工具，與 Shopee、Meta／Threads 無任何官方關係或授權；所有發文與分潤都用<b>你自己綁的帳號與金鑰</b>。
        </Note>
      </Section>

      <Section id="principles" title="運作原理（先懂這幾點）">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink [overflow-wrap:anywhere]">
          <li><b>每個人綁自己的金鑰，不互相共用</b>：Threads、Gemini、蝦皮、圖床都是綁你自己的；敏感資料一律加密保存，只在伺服器端使用，不會外洩。</li>
          <li><b>只發你核准過的草稿</b>：AI 與爬蟲只會產生「待審」草稿／素材，<b>絕不會自己發文</b>，發布前一定經你核准。</li>
          <li><b>防封節奏</b>：發文會自動拉開間隔、控制每日上限，盡量自然、降低帳號風險。</li>
          <li><b>時區固定台北</b>：所有排程時間與每日上限都以台北時間計算。</li>
        </ul>
      </Section>

      <Section id="setup" title="第一步：綁定你自己的金鑰" badge="必要">
        <Steps
          items={[
            <><b>Threads 發文帳號</b>（必要）：到帳號管理手動貼上 access token，系統會自動每日展期。</>,
            <><b>Gemini AI 金鑰</b>（必要）：用來生成文案；沒綁就只會產出無文案素材。</>,
            <><b>蝦皮分潤</b>（選用）：填 Open API（App ID／Secret）或只填 Affiliate ID，皆可自動換成你的分潤連結＋subId 分流。</>,
            <><b>圖床</b>（選用）：綁 Cloudflare R2（建議，流量免費）或 Cloudinary，媒體進<b>你自己的</b>雲端，不佔站方空間。</>
          ]}
        />
        <Note>
          全部到 <Link href="/accounts" className="text-brand underline">帳號管理</Link> 填入；逐項取得步驟見{" "}
          <Link href="/guide" className="text-brand underline">金鑰取得教學</Link>。首頁的「開始設定」卡會顯示你的完成度。
        </Note>
      </Section>

      <Section id="materials" title="第二步：準備素材">
        <p className="mb-2 text-sm text-ink">
          一份素材，就是把<b>一個商品、你的分潤連結，加上圖片或影片</b>包在一起。如果你綁了 Gemini，系統還會順手幫你寫好文案。素材建好之後可以重複「排一篇」，不用每次重弄。
        </p>
        <Steps
          items={[
            <>
              到<Link href="/materials" className="text-brand underline">素材</Link>頁<b>貼上你的蝦皮商品連結</b>，
              並<b>上傳該商品的圖片／影片</b>。
            </>,
            <>系統會換上<b>你的</b>分潤連結；若已綁定 Gemini，也會一併生成文案，存成素材。</>
          ]}
        />
        <Note>
          共享素材庫只帶「商品」本身：匯入時用<b>你自己的金鑰重產分潤連結</b>（綁了 Gemini 才會重產文案），不會沿用分享者的連結或文案。
        </Note>
      </Section>

      <Section id="publish" title="第三～四步：核准 → 排程 → 發布">
        <Steps
          items={[
            <>在<Link href="/materials" className="text-brand underline">素材</Link>對某商品按「排一篇」，產生<b>待審草稿</b>。</>,
            <>到<Link href="/drafts" className="text-brand underline">文章管理</Link>檢視／微調草稿，<b>核准</b>後才進發文佇列（也可改排程時間）。</>,
            <>系統依<b>防封節奏</b>自動發到你的 Threads 帳號。</>,
            <>分潤連結可放在<b>留言</b>、並稍微延後補上，降低連結影響觸及的風險。</>
          ]}
        />
        <Note>文章管理整併了發文、草稿、AI 部落客與素材。</Note>
      </Section>

      <Section id="redirect" title="自有短連結（轉址服務）" badge="選用">
        <p className="text-sm text-ink [overflow-wrap:anywhere]">
          可把分潤連結換成你自己的<b>短連結</b>，讓貼文更乾淨、也能看點擊統計。到{" "}
          <Link href="/links" className="text-brand underline">轉址服務</Link> 管理。
        </p>
      </Section>

      <Section id="agent" title="AI 部落客代理人" badge="進階·選用">
        <p className="text-sm text-ink [overflow-wrap:anywhere]">
          設定「人格 × 領域」後，代理人每天自動抓當日新聞、用<b>你自己的 Gemini</b> 改寫成貼文，
          產出<b>待審草稿</b>（一樣需人工核准）。在文章管理內設定與檢視。
        </p>
      </Section>

      <Section id="insights" title="成效分析與通知">
        <p className="text-sm text-ink [overflow-wrap:anywhere]">
          <Link href="/insights" className="text-brand underline">成效分析</Link> 看各帳號／商品的發布與收益（有綁蝦皮金鑰時自動回灌佣金，賺錢素材排前）。
          綁 Telegram 後，待審草稿與異常會即時通知，待審草稿還能在私聊一鍵核准／駁回。
        </p>
      </Section>

      <Section id="privacy" title="安全與隱私">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink [overflow-wrap:anywhere]">
          <li>金鑰<b>絕不會以明文存進資料庫</b>：只放在環境變數，或加密後才存資料庫，而且只在伺服器端解密使用。</li>
          <li><b>多租戶隔離</b>：你的素材、草稿、帳號、憑證都只屬於你，其他使用者看不到也用不到。</li>
          <li>對外連線都有安全檢查，避免被導向內部位址或惡意目標。</li>
          <li>細節見 <Link href="/privacy" className="text-brand underline">隱私權政策</Link> 與 <Link href="/terms" className="text-brand underline">服務條款</Link>。</li>
        </ul>
      </Section>
    </div>
  );
}
