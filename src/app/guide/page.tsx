import Link from "next/link";

export const dynamic = "force-static";

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
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink">
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

export default function GuidePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">金鑰取得教學</h1>
        <p className="text-sm text-ink-2">
          每項服務都綁<b>你自己的</b>金鑰；機密類一律 AES-256 加密存、不入庫、不外露。到{" "}
          <Link href="/accounts" className="text-brand underline">帳號管理</Link> 填入。
        </p>
      </div>

      <Section id="threads" title="Threads 發文帳號（OAuth）" badge="必要">
        <Guide
          steps={[
            "到 <b>developers.facebook.com</b> 建立 App，建立時選用途「<b>Access the Threads API</b>」。",
            "在 App 設定加入權限：<code>threads_basic</code>、<code>threads_content_publish</code>（發文）＋ <code>threads_manage_insights</code>、<code>threads_read_replies</code>、<code>threads_manage_replies</code>、<code>threads_keyword_search</code>（成效/留言/選題）。OAuth <b>預設一次請求全部</b>，故 App 端這些權限都要開；若只想用發文、暫不上進階功能，部署端設環境變數 <code>THREADS_SCOPES=threads_basic,threads_content_publish</code> 即可只請求基本權限。",
            "App 設定 → 基本，取得 <b>Threads App ID</b> 與 <b>App Secret</b>（部署端環境變數，由管理者設定）。",
            "在 Threads 用途的 OAuth 設定填入 <b>Redirect URI</b>：<code>https://你的網域/auth/callback</code>（要與實際一致，否則被拒）。",
            "一般使用者不需自建 App：直接在「帳號管理」按 <b>用 Threads 登入綁定</b> 走 OAuth 授權即可。"
          ]}
          note="存取權杖短效 1 小時，本服務自動換成 60 天長效並每日展期；權杖加密存。正式發佈權限需通過 Meta App Review。"
          docs={[
            { label: "Threads 取得權杖官方文件", href: "https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions/" },
            { label: "Threads API 總覽", href: "https://developers.facebook.com/docs/threads" }
          ]}
        />
      </Section>

      <Section id="gemini" title="AI 文案金鑰（Google Gemini）" badge="必要">
        <Guide
          steps={[
            "到 <b>aistudio.google.com/app/apikey</b>，用 Google 帳號登入。",
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

      <Section id="apify" title="自動抓文（Apify）" badge="管理者">
        <Guide
          steps={[
            "到 <b>console.apify.com</b> 註冊／登入。",
            "<b>Settings → API &amp; Integrations</b>，複製 <b>Personal API token</b>。",
            "（選填）指定要用的 Actor id；填到帳號管理的 Apify 欄位即可監看來源。"
          ]}
          note="Token 為機密，加密存。僅管理者需要綁定（自動抓文為 owner 專屬子系統）。"
          docs={[{ label: "Apify API token 文件", href: "https://docs.apify.com/platform/integrations/api" }]}
        />
      </Section>

      <Section id="cloudinary" title="圖片／影片存放：Cloudinary" badge="圖床·選用">
        <Guide
          steps={[
            "到 <b>cloudinary.com</b> 註冊，Dashboard 取得 <b>Cloud name</b>。",
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
            "到 Cloudflare 後台 <b>R2 物件儲存</b>，<b>Create bucket</b> 建一個 bucket（需先開通 R2，可能要綁付款）。",
            "在 R2 總覽頁 <b>Account Details</b> 區，點 <b>API Tokens</b> 旁的 <b>Manage</b> → <b>Create API token</b>（帳號層級或個人 User token 皆可）。",
            "權限選 <b>Object Read &amp; Write</b>，並用 <b>Apply to specific buckets only</b> 只勾你這個 bucket（最小權限）。",
            "建立後複製 <b>Access Key ID</b> 與 <b>Secret Access Key</b>（<b>Secret 只顯示這一次</b>，離開就看不到，務必當下存好）。",
            "在同頁 <b>Account Details</b> 找你的 <b>Account ID</b>（S3 端點即 <code>https://&lt;Account_ID&gt;.r2.cloudflarestorage.com</code>，系統自動組、免填）。",
            "讓 bucket 可公開讀：啟用 <b>r2.dev</b> 受管網址，或（建議）綁<b>自訂網域</b>；把該公開網址（<b>需含 <code>https://</code></b>）填入「公開讀網域」。",
            "到帳號管理 R2 欄位填這 5 項：<b>Account ID、bucket、公開讀網域、Access Key ID、Secret Access Key</b>（綁了 R2 會優先於 Cloudinary）。"
          ]}
          note="region 固定 auto（系統自動帶、免填）。Token 限縮到「單一 bucket、Object Read & Write」，外洩也只影響該 bucket。Access Key/Secret 加密存、只在 server 用。注意：目前 R2 存檔只驗欄位格式、不做連線測試，金鑰填錯要到實際上傳才會發現。"
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Section id="telegram" title="Telegram 通知（選填）">
          <Guide
            steps={[
              "在 Telegram 找 <b>@BotFather</b>，<code>/newbot</code> 建立機器人取得 Bot Token（部署端設定）。",
              "對你的機器人傳一句話，再用 <code>@userinfobot</code> 或 getUpdates 取得你的 <b>chat id</b>。",
              "把 chat id 填到設定頁的 Telegram 欄位，待審／異常即時通知你。"
            ]}
            docs={[{ label: "Telegram Bot API", href: "https://core.telegram.org/bots/api" }]}
          />
        </Section>

        <Section id="discord" title="Discord 通知（選填）">
          <Guide
            steps={[
              "在你的 Discord 伺服器：<b>伺服器設定 → 整合 → Webhook → 新增 Webhook</b>。",
              "選頻道後 <b>複製 Webhook URL</b>。",
              "把 URL 填到設定頁的 Discord 欄位即可。"
            ]}
            docs={[{ label: "Discord Webhooks 教學", href: "https://support.discord.com/hc/en-us/articles/228383668" }]}
          />
        </Section>
      </div>
    </div>
  );
}
