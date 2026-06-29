import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "金鑰取得教學 — IwantPo" };

// 全專案各服務金鑰怎麼取得（步驟＋官方文件連結）。所有金鑰只綁你自己的，加密存、不入庫、不外露。
// 內容對照各服務 2026/06 官方文件。

type Step = { steps: string[]; note?: string; docs: { label: string; href: string }[] };

function Section({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) {
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

function Guide({ steps, note, docs }: Step) {
  return (
    <>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink [overflow-wrap:anywhere]">
        {steps.map((s, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: s }} />
        ))}
      </ol>
      {note && <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-ink-2">🔐 {note}</p>}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {docs.map((d) => (
          <a key={d.href} href={d.href} target="_blank" rel="noopener noreferrer" className="text-brand underline">
            {d.label} ↗
          </a>
        ))}
      </div>
    </>
  );
}

export default async function GuidePage() {
  // 一般成員／登出者看不到平台管理員專屬服務（如自動抓文 Apify）的設定教學。
  const user = await getCurrentUser();
  const isOwner = user?.isOwner ?? false;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">金鑰取得教學</h1>
        <p className="text-sm text-ink-2">
          每項服務都綁<b>你自己的</b>金鑰；機密類一律 AES-256 加密存、不入庫、不外露。到{" "}
          <Link href="/accounts" className="text-brand underline">帳號管理</Link> 填入。
        </p>
      </div>

      <Section id="threads" title="Threads 發文帳號（手動貼 token）" badge="必要">
        <Guide
          steps={[
            "到 <a href=\"https://developers.facebook.com/apps\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-brand underline\">developers.facebook.com</a> 建立 App，建立時選用途「<b>Access the Threads API</b>」。",
            "在 App 加入 <b>Threads</b> 使用案例，權限勾 <code>threads_basic</code>、<code>threads_content_publish</code>（發文）；要成效/留言/選題再加 <code>threads_manage_insights</code>、<code>threads_read_replies</code>、<code>threads_manage_replies</code>、<code>threads_keyword_search</code>。",
            "在 <b>Threads 使用案例 → 設定</b>，把要發文的 Threads 帳號加進去，按 <b>產生存取權杖（Generate access token）</b>，複製 token。",
            "（選填）若你用的是 1 小時短效權杖，可至 App 設定 → 基本取得 <b>App Secret</b>（填在手動新增的「App 密鑰」欄）讓系統換成 60 天長效；直接用後台產生的長效權杖則免填。",
            "到「帳號管理 → 手動新增」<b>貼上 access token</b>（短效權杖再附 App 密鑰）即完成綁定。"
          ]}
          note="本服務以「手動貼 token」綁定（OAuth 一鍵流程已移除——對外開放需 Meta App Review／商業驗證）。權杖加密存、只在 server 用；系統會自動每日展期（不需 App 密鑰）。"
          docs={[
            { label: "Threads 取得權杖官方文件", href: "https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions/" },
            { label: "Threads API 總覽", href: "https://developers.facebook.com/docs/threads" }
          ]}
        />
      </Section>

      <Section id="gemini" title="AI 文案金鑰（Google Gemini）" badge="必要">
        <Guide
          steps={[
            "到 <a href=\"https://aistudio.google.com/app/apikey\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-brand underline\">aistudio.google.com/app/apikey</a>，用 Google 帳號登入。",
            "左側點 <b>Get API key</b> → <b>Create API key</b>，選新建或既有 Google Cloud 專案。",
            "複製以 <code>AIza…</code> 開頭的金鑰，貼到帳號管理的 Gemini 欄位。免費額度不需信用卡。"
          ]}
          note="2026 起新金鑰為 auth key；未加限制的舊 standard key 將被拒。建議建新金鑰並視需要加上 API/網域限制。金鑰只綁你自己、加密存。"
          docs={[
            { label: "Gemini API 金鑰官方說明", href: "https://ai.google.dev/gemini-api/docs/api-key" },
            { label: "Google AI Studio", href: "https://aistudio.google.com/app/apikey" }
          ]}
        />
      </Section>

      <Section id="shopee" title="蝦皮分潤（Shopee Affiliate Open API）" badge="擇一">
        <Guide
          steps={[
            "登入<b>蝦皮分潤行銷平台</b>（Shopee Affiliate），確認帳號已開通分潤資格。",
            "進入 <b>Open API／開發者</b> 專區（如未開放，向你的蝦皮分潤窗口申請 Open API 權限）。",
            "取得 <b>App ID</b> 與 <b>Secret</b>，填到帳號管理的蝦皮金鑰；本服務用它簽章產生分潤連結與 subId。",
            "<b>沒有 Open API 也行</b>：只填你的 <b>Affiliate ID</b>，系統用官方 an_redir 自組追蹤連結（仍可分潤＋subId 分流）。"
          ]}
          note="App Secret 為機密，AES-256 加密存。產生連結時才於 server 即時簽章，不外露。"
          docs={[
            { label: "蝦皮分潤行銷平台", href: "https://affiliate.shopee.tw/" },
            { label: "Shopee Open Platform", href: "https://open.shopee.com/" }
          ]}
        />
      </Section>

      {/* 自動抓文（Apify）為平台管理員專屬，僅管理員看得到此教學。 */}
      {isOwner && (
        <Section id="apify" title="抓文生素材（Apify）" badge="管理員專屬">
          <Guide
            steps={[
              "到 <a href=\"https://console.apify.com\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-brand underline\">console.apify.com</a> 註冊／登入。",
              "<b>Settings → API &amp; Integrations</b>，複製 <b>Personal API token</b>。",
              "可選填 Actor id；到帳號管理的 Apify 欄位填入後即可監看來源。"
            ]}
            note="Token 為機密，加密存、只在 server 用（計費算在你的 Apify 帳上）。"
            docs={[{ label: "Apify API token 文件", href: "https://docs.apify.com/platform/integrations/api" }]}
          />
        </Section>
      )}

      <Section id="cloudinary" title="圖片／影片存放：Cloudinary" badge="圖床·選用">
        <Guide
          steps={[
            "到 <a href=\"https://cloudinary.com\" target=\"_blank\" rel=\"noopener noreferrer\" class=\"text-brand underline\">cloudinary.com</a> 註冊，Dashboard 取得 <b>Cloud name</b>。",
            "<b>Settings → Upload → Upload presets</b> 新增一個 <b>Unsigned</b> preset，記下名稱。",
            "把 Cloud name 與 preset <b>兩者都填</b>到帳號管理；（選填）填 API Key／Secret 可在儀表板看用量。"
          ]}
          note="Unsigned upload preset 本就設計給前端公開使用，非機密；API Key/Secret 為機密，加密存。"
          docs={[
            { label: "Cloudinary Upload presets", href: "https://cloudinary.com/documentation/upload_presets" },
            { label: "Cloudinary 入門", href: "https://cloudinary.com/documentation/how_to_integrate_cloudinary" }
          ]}
        />
      </Section>

      <Section id="r2" title="圖片／影片存放：Cloudflare R2（S3 相容）" badge="圖床·建議（流量免費）">
        <Guide
          steps={[
            "到 Cloudflare 後台 <b>R2 物件儲存</b>，按 <b>建立貯體（Create bucket）</b> 建一個 bucket（需先開通 R2，可能要綁付款）。",
            "回 R2 總覽頁，捲到最下方的 <b>帳戶詳細資訊（Account Details）</b>：記下 <b>帳戶 ID（Account ID）</b>（S3 端點 <code>https://&lt;帳戶ID&gt;.r2.cloudflarestorage.com</code> 系統自動組、免填）。",
            "在 <b>帳戶詳細資訊</b> 的 <b>API 令牌</b> 點 <b>管理</b> → <b>建立 Account API 權杖</b>（帳戶層級；個人 User 權杖亦可）。",
            "權限務必選 <b>物件讀取和寫入（Object Read &amp; Write）</b>——<b>不要選「物件唯讀」</b>（唯讀無法上傳）；指定貯體建議選 <b>僅套用至特定貯體</b> 只勾你這個 bucket（最小權限）。TTL 可留「永久」。",
            "按 <b>建立</b> 後，畫面顯示認證。<b>要填的是「針對 S3 用戶端使用下方的認證」</b>：<b>存取金鑰識別碼</b>＝Access Key ID、<b>秘密存取金鑰</b>＝Secret Access Key。<b>不是</b>最上方的「<b>權杖值（cfat…／cfut…）</b>」（那是 Cloudflare API 用、本服務用不到）。<b>這些只顯示這一次</b>，務必當下存好。",
            "讓 bucket 可公開讀：啟用 <code>r2.dev</code> 受管網址，或（建議）綁<b>自訂網域</b>；把該公開網址（<b>需含 <code>https://</code></b>）填入「公開讀網域」。",
            "到帳號管理 R2 欄位填這 5 項：<b>帳戶 ID、bucket 名稱、公開讀網域、Access Key ID（存取金鑰識別碼）、Secret Access Key（秘密存取金鑰）</b>（綁了 R2 會優先於 Cloudinary）。"
          ]}
          note="region 固定 auto（系統自動帶、免填）。權限選「物件讀取和寫入」、限縮到單一 bucket，外洩也只影響該 bucket。Access Key/Secret 加密存、只在 server 用。儲存時會對 bucket 做連線測試（HeadBucket），金鑰或 bucket 填錯、或 token 只有唯讀權限會當下擋下。"
          docs={[
            { label: "R2 API Tokens", href: "https://developers.cloudflare.com/r2/api/tokens/" },
            { label: "R2 S3 相容 API", href: "https://developers.cloudflare.com/r2/api/s3/api/" },
            { label: "R2 公開 bucket", href: "https://developers.cloudflare.com/r2/buckets/public-buckets/" }
          ]}
        />
      </Section>

      <Section id="sharing" title="共享圖床素材的權限問題（需要雙金鑰嗎？）">
        <p className="text-sm text-ink">
          <b>不需要第二把金鑰。</b>分享素材時，共享的只是<b>公開「投放 URL」</b>（Cloudinary <code>secure_url</code>／
          R2 公開物件網址）——那是<b>唯讀 CDN 連結</b>，本質上無法改／刪。修改／刪除需要的是 API Key／Secret，
          這些只存在 server（加密存）、<b>從不外露、也不隨素材共享</b>。匯入者更是用<b>自己的金鑰重抓、重傳到自己雲端</b>，
          連分享者的圖都不會沿用，只在共享庫當預覽縮圖。額外保險：R2 token 已限縮到「單一 bucket、讀寫」，外洩也只影響該 bucket。
        </p>
      </Section>

      <Section id="telegram" title="Telegram 通知（選填）">
        <Guide
          steps={[
            "到設定頁「個人 Telegram 通知」按 <b>一鍵綁定</b>，開啟 bot 後按 <code>START</code> 即自動完成（免手動複製 chat id）。",
            "綁定後，待審草稿與異常會即時推到你的 Telegram；待審草稿還可一鍵核准／駁回（僅限私聊）。",
            "（後備）也可手動：對 bot 按 <code>/start</code> 取得 Chat ID，貼到設定頁的手動欄位。"
          ]}
          docs={[{ label: "Telegram Bot API", href: "https://core.telegram.org/bots/api" }]}
        />
      </Section>
    </div>
  );
}
