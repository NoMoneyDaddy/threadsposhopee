# ThreadsPoShopee

自動在 **Threads** 發佈 **Shopee 分潤文案** 的多帳號排程控制台。
由原本的 n8n 工作流（`👌Threads Token 自動更新`）轉型而成，把 43 個節點收斂為可維護的服務模組 + 前端控制台。

## 它做什麼

```
監看來源 Threads 帳號 → 去重 → 抓蝦皮短連結 → 還原商品 →
換成「你自己 subId」的分潤短連結 → 取商品名 →
AI 生成擬人化中文文案（humanizer-zh 規則）→ 存草稿審核 → 發到你的 Threads（連結放留言）
```

相較原 n8n 的升級：

| 項目 | n8n 原版 | 本專案 |
|------|---------|--------|
| 帳號 | 單帳號寫死 | 多 Threads／多 Shopee 帳號，前端管理 |
| 來源 | 單一來源寫死 | 多來源，各自頻率與模式 |
| Shopee 簽名 | 依賴外部 Zeabur 服務 | **內建 HMAC-SHA256**，無外部相依 |
| 文案 | 單一 prompt | 內建 humanizer-zh「去 AI 腔」規則 |
| 發布 | 自動（易封號） | **一律審核佇列**，核准過才發 |
| 狀態 | Google Sheets + Postgres | 單一 Postgres（Supabase） |
| 控制台 | 無 | Next.js 網站 |
| 金鑰 | 明文散落 | 環境變數 + AES-256-GCM 加密入庫 |

## 技術棧

- **Next.js 14**（App Router）前端 + API
- **Supabase**（Postgres + Auth + RLS）
- **Gemini 2.5 Flash** 文案（多模態，可在 `src/services/ai/` 切換 provider）
- **Vercel Cron** 排程（`vercel.json`，預設每 15 分）

## 快速開始

```bash
npm install
cp .env.example .env.local   # 不填也能跑 → 進 Demo 模式
npm run dev                  # http://localhost:3000
```

**Demo 模式**（未設定金鑰）：用 `src/fixtures/` 的假資料，不呼叫任何外部服務，可完整點完整個流程。

只在終端機跑一次 pipeline：

```bash
npm run pipeline:demo
```

## 上線設定

1. 建 Supabase 專案，**依序**跑 `supabase/migrations/` 下所有 SQL（`0001_init.sql` → `0016_profile_cloudinary.sql`）
2. 填環境變數（Supabase、`APP_ENCRYPTION_KEY`、`OWNER_EMAIL`、Apify、Shopee、Gemini、Cloudinary、`CRON_SECRET`，以及 Threads OAuth 的 `THREADS_APP_ID/SECRET/REDIRECT_URI`）
3. 部署（擇一）：

### A. Vercel
直接連 repo 部署，`vercel.json` 已設一條總排程，每 15 分自動打 `/api/cron/all`，全自動。

### B. Zeabur（推薦給已有 Zeabur 帳號者）
1. Zeabur → New Service → Git，選此 repo。Zeabur 會**自動偵測 Next.js**（免 Dockerfile），自動 `next build` / `next start`。
2. 在該服務的 **Variables** 填上所有環境變數（同 `.env.example`）。
3. 排程（**全傻瓜：只要一條**）：`vercel.json` 在 Zeabur 不生效，改開**一個** Zeabur Cron Job，每 15 分打總排程即可——它會自己跑爬取＋發布已核准的草稿，並在每天 03 點展期 token、每週一 04 點健檢連結：
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<你的網域>/api/cron/all
   ```
   - `CRON_SECRET` 呼叫端與伺服器端要一致；生產環境若沒設，端點會回 500 擋掉（安全保護）。
   - 進階：仍保留 `/api/cron`、`/api/cron/publish`、`/api/cron/refresh-tokens`、`/api/cron/check-links` 可各自獨立排程。

### 連 Threads 發文帳號（OAuth，免手貼 token）
1. 在 [Meta 開發者後台](https://developers.facebook.com/) 建立含 **Threads API** 的 App，取得 App ID / Secret。
2. 把 `https://<你的網域>/api/auth/threads/callback` 設為 **Valid OAuth Redirect URI**，並填好 `THREADS_APP_ID/SECRET/REDIRECT_URI`。
3. 登入網站 → 帳號管理 → 「用 Threads 連結帳號」一鍵授權；系統自動換 60 天長期 token 並由上面的展期 cron 自動續期。

### 兩條流程的分工
- **爬取** `/api/cron` → `runAllSources()`：爬來源 → 換分潤連結 → AI 文案 → 存草稿（一律待人工核准）。**絕不發文**。
- **發文** `/api/cron/publish` → `runPublishQueue()`：挑「已核准」草稿，依防封節奏（`PUBLISH_MIN_GAP_MINUTES` / `PUBLISH_MAX_PER_DAY` / `PUBLISH_BATCH_PER_RUN`）逐篇發到 Threads。

> 備註：原 n8n 依賴的 Zeabur「蝦皮簽名服務」已不再需要——簽名邏輯已內建進 `src/services/shopee/sign.ts`，可以把那個舊服務停掉。

## 目錄結構

```
src/
  app/                 前端頁面 + API routes
  components/          前端互動元件
  services/
    scraper/threads.ts   Apify 爬蟲 + 貼文解析
    shopee/sign.ts       自建簽名（取代 Zeabur）
    shopee/expand.ts     短網址還原
    shopee/affiliate.ts  分潤連結 + 商品名（含無 API 的 an_redir 後備）
    ai/humanizer.ts      humanizer-zh 規則 + prompt
    ai/prefs.ts          文案客製化偏好（語氣/溫度/emoji/長度，主文與回覆分開）
    ai/gemini.ts         Gemini 多模態呼叫
    media/cloudinary.ts  媒體中轉（自綁優先、內建 SSRF 防護）
    threads/publish.ts   發文（容器→發布→留言/串文 2/2）
    threads/oauth.ts     OAuth 一鍵連帳號
    threads/token.ts     長期 token 展期
    threads/refresh.ts   到期 token 自動展期 worker
    publish/queue.ts     發文佇列（防封節奏 + 分布式鎖 + 跳過失效帳號）
    publish/cadence.ts   節奏：保底間隔 + 隨機抖動 + ETA 規劃
    pipeline/run.ts      端到端編排
  lib/                 env / 加密 / 資料層 / cron 驗證 / SSRF 防護 / 型別
supabase/migrations/   資料庫 schema（0001–0016）
```

## ⚠️ 安全

- 原始 n8n 匯出檔含外洩金鑰，**不入庫**（見 `.gitignore`），且相關 token 應於各平台撤銷重設。
- 所有憑證只放伺服器端；存 DB 的 token／secret 一律 AES-256-GCM 加密。
- 發布前一律需人工核准（審核佇列），降低封號風險。

## 功能總覽

- [x] Supabase Auth 登入（Google OAuth）+ 全站保護 + 多租戶資料隔離（owner／member）
- [x] 前端 CRUD：帳號／來源／素材／草稿的新增、編輯、刪除、停用
- [x] Threads OAuth 一鍵連帳號（免手貼 token）+ 長期 token 每日自動展期
- [x] 真實發布（解密 token → Cloudinary 中轉 → `publishToThreads`，連結放留言）
- [x] 爬取／發文兩條獨立排程 + 防封節奏（間隔／每日上限／批次）
- [x] 審核佇列：草稿審核、AI 重寫、排程、卡住可重試
- [x] 即時儀表板（服務健康、Threads 額度、Cloudinary 用量、需要注意提醒、發文排隊 ETA/塞車提示）
- [x] 排程總覽（依日期分組，圖片/影片縮圖正確渲染）
- [x] AI 文案客製化（語氣/溫度/emoji/長度，主文與回覆分開）+ humanizer-zh 去 AI 腔
- [x] 無 Shopee Open API 也能分潤：填 `affiliate_id` 用官方 `an_redir` 自組追蹤連結
- [x] 防封節奏隨機抖動（保底間隔 + 抖動，避免固定節奏被偵測）
- [x] 手動推送：一鍵「立即跑一輪佇列」、自寫一則直推（free-form，可附媒體）
- [x] 各人自綁 Cloudinary（素材中轉進自己雲端，不佔共用額度）
- [x] 發文預覽對齊 Threads 串文（主文 1/2 + 接續貼文 2/2）
- [x] 安全：AES-256-GCM 入庫加密、Cron 安全驗證、SSRF 防護、發文佇列分布式鎖、發文憑證 owner 過濾防越權

### 後續可選增強
- [ ] 影片走 Gemini Files API（大檔）
- [ ] 成效儀表板接 Shopee 報表 / Threads insights
- [ ] 素材分潤連結到期自動偵測重產
- [ ] 佇列分片／多帳號並行（高頻發文擴展性）
```
