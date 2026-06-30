# IwantPo

把商品分潤連結，依防封節奏自動排程發文的多帳號控制台。
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
- **Gemini 2.5 Flash-Lite** 文案（多模態最便宜，預設；可用 `GEMINI_MODEL` 換 model 或在 `src/services/ai/` 切換 provider）
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

1. 建 Supabase 專案，**依序**跑 `supabase/migrations/` 下所有 SQL（`0001_init.sql` 起，依檔名數字順序全跑到最新一個）
2. 填環境變數（Supabase、`APP_ENCRYPTION_KEY`、`OWNER_EMAIL`、Apify、Shopee、Gemini、Cloudinary、`CRON_SECRET`；Threads 選填 `THREADS_APP_SECRET`／`THREADS_SCOPES`，用於把手動貼的短效 token 自動換長效）
3. 部署（擇一）：

### A. Vercel
直接連 repo 部署，`vercel.json` 已設一條總排程，每 15 分自動打 `/api/cron/all`，全自動。

### B. Zeabur（推薦給已有 Zeabur 帳號者）
1. Zeabur → New Service → Git，選此 repo。Zeabur 會**自動偵測 Next.js**（免 Dockerfile），自動 `next build` / `next start`。
2. 在該服務的 **Variables** 填上所有環境變數（同 `.env.example`）。
3. 排程（**零設定**）：常駐部署（`next start`）內建排程器（`src/instrumentation.ts`）會自動每
   `INTERNAL_SCHEDULER_MINUTES` 分鐘（預設 15）自呼 `/api/cron/all`，**不需要在 Zeabur 開任何 Cron Job**
   （Zeabur 也沒有原生 cron 面板）。上線即全自動跑爬取＋發布已核准草稿，並於每天 03 點展期 token、
   每週一 04 點健檢連結。儀表板的「自動駕駛運轉中」心跳即由此而來。
   - **調整頻率**：在 Variables 設 `INTERNAL_SCHEDULER_MINUTES=2`（每 2 分；要更即時可設 `1`）。
     建議一併設 `PUBLISH_CRON_INTERVAL_MINUTES`＝同值，讓儀表板「下次發文倒數／預計時間」對齊。
     改完 **Redeploy** 生效。每日/週/月任務以原子守門（`claimCronOnce`）保證一天一次，故任何頻率都安全。
   - 注意實際發文頻率受**防封間隔**（每帳號預設 4 小時）主宰，把排程調密只縮短「到點後多久送出」的延遲，
     不會讓單帳號發更密。
   - `CRON_SECRET` 內建排程會自動帶上；外部若要另打端點，呼叫端與伺服器端要一致（生產未設則端點回 500 擋掉）。
   - **serverless（如 Vercel）不常駐** → 內建排程不適用：設 `INTERNAL_SCHEDULER=false` 關閉，改用外部 cron
     打 `/api/cron/all`（Vercel 已由 `vercel.json` 每 15 分代勞）。
   - 進階：仍保留 `/api/cron`、`/api/cron/publish`（可 `?shards=N&shard=i` 分片並行）、`/api/cron/refresh-tokens`、
     `/api/cron/check-links` 可各自獨立排程。

### 連 Threads 發文帳號（手動貼 token）
> OAuth 一鍵流程已移除：對外開放需通過 Meta App Review／商業驗證。現以手動貼 access token 綁定。
1. 在 [Meta 開發者後台](https://developers.facebook.com/) 建立含 **Threads API** 的 App，加入 Threads 使用案例並勾權限。
2. 在 **Threads 使用案例 → 設定**，把要發文的帳號加進去，按 **產生存取權杖** 取得 token（後台產生的本即 60 天長效）。
3. 登入網站 → 帳號管理 → 手動新增，貼上 token。長效權杖由展期 cron 自動續期；若貼 1 小時短效權杖，另填 App 密鑰（`THREADS_APP_SECRET`）讓系統換成長效。

### 兩條流程的分工
- **爬取** `/api/cron` → `runAllSources()`：爬來源 → 換分潤連結 → AI 文案 → 存草稿（一律待人工核准）。**絕不發文**。
- **發文** `/api/cron/publish` → `runPublishQueue()`：挑「已核准」草稿，依防封節奏（`PUBLISH_MIN_GAP_MINUTES` / `PUBLISH_MAX_PER_DAY` / `PUBLISH_BATCH_PER_RUN`）逐篇發到 Threads。

### 擴展：帳號分片並行（帳號／草稿量大時才需要）
單條發文 cron 每輪 60s 序列處理所有帳號，量大時可能一輪跑不完。可開**多條** cron 並行，各自只處理自己那片帳號（同帳號穩定落同片，**防封節奏不被打散**）：

```bash
# 4 條 cron，各打不同 shard（0..3）
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<網域>/api/cron/publish?shards=4&shard=0"
curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://<網域>/api/cron/publish?shards=4&shard=1"
# …shard=2、shard=3
```

- 各片用獨立分布式鎖 → 可真正並行；同片不重疊。
- **全域模式與分片模式擇一**：用了 `/api/cron/all` 或不帶參數的 `/api/cron/publish`，就別再同時開分片，否則會重複發文。

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
    threads/oauth.ts     手動貼 token 用：scope 判斷＋帳號 profile 查詢（OAuth 一鍵已移除）
    threads/token.ts     長期 token 展期
    threads/refresh.ts   到期 token 自動展期 worker
    publish/queue.ts     發文佇列（防封節奏 + 分布式鎖 + 帳號分片並行 + 延遲補留言）
    publish/cadence.ts   節奏：保底間隔 + 隨機抖動 + ETA 規劃 + 帳號分片
    publish/reply-timing.ts  留言延遲（保底 + 抖動 + 逐則覆寫）
    pipeline/run.ts      端到端編排
  lib/                 env / 加密 / 資料層 / cron 驗證 / SSRF 防護 / 型別
supabase/migrations/   資料庫 schema（0001–0052）
```

## ⚠️ 安全

- 原始 n8n 匯出檔含外洩金鑰，**不入庫**（見 `.gitignore`），且相關 token 應於各平台撤銷重設。
- 所有憑證只放伺服器端；存 DB 的 token／secret 一律 AES-256-GCM 加密。
- 發布前一律需人工核准（審核佇列），降低封號風險。

## 功能總覽

- [x] Supabase Auth 登入（Google OAuth）+ 全站保護 + 多租戶資料隔離（owner／member）
- [x] 前端 CRUD：帳號／來源／素材／草稿的新增、編輯、刪除、停用
- [x] Threads 帳號連結（手動貼 access token）+ 長期 token 每日自動展期
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
- [x] 延遲留言：串文 2/2 分潤連結延後補發（保底 + 隨機抖動 + 逐則覆寫），避免「秒留言」固定行為
- [x] 延遲留言可視化：草稿頁狀態（待補/補發中/已補/失敗＋ETA）與一鍵重補、儀表板待補/失敗統計、cron 失敗告警
- [x] 帳號分片並行：多條 cron 各跑一片帳號（`?shards=N&shard=i`），高量時擴展吞吐
- [x] 成效統計：Shopee 分潤報表 + Threads 貼文互動數據（views/likes/…，含 app_state 快取省 API 額度）+ 最佳發文時段建議
- [x] 失效分潤連結自動重產：健檢偵測失效 → 同 subId 重產 → 再驗 → 復活（重產不成才標失效）；素材頁可一鍵手動健檢、儀表板顯示失效素材數
- [x] 常青回收：素材庫「全部再排（常青回收）」一次把有效素材排入佇列（依空時段，不重燒 token）
- [x] 重發可選「最佳時段」：依該帳號 Threads insights 算出的高觸及整點排程（資料不足退回預設時段）
- [x] 大影片走 Gemini Files API（resumable upload）讓 AI 看得到影片生成文案；圖片維持 inline（大小守門）
- [x] 每日成效摘要：總排程每日推一則 Telegram 摘要（發布量/互動/熱門貼文/分潤收益/待辦提醒＋缺稿預警），可選 AI 成效歸因分析（`DAILY_DIGEST_AI=1`，需 Gemini 金鑰），免登入掌握脈動
- [x] 觸及驟降預警（疑似降觸及／shadowban）：比較近期 vs 基準中位觀看，驟降即在成效頁示警並帶入每日摘要主動推播，提醒放慢節奏
- [x] 全域發文急停開關（owner）：儀表板一鍵暫停所有自動發文（cron + 立即跑一輪），不影響單篇手動發，緊急防封用
- [x] 個人通知：每人在設定頁綁自己的 Telegram（deeplink 一鍵綁定，免手貼 chat_id），接收屬於自己的提醒（貼文待確認／token 展期失敗／留言補發失敗），待審草稿可一鍵核准／駁回（僅限私聊）；亦可選用瀏覽器推播
- [x] 防封強化（皆 env 開關、預設關閉）：商品冷卻期 `PRODUCT_COOLDOWN_HOURS`、新帳號暖機 `ACCOUNT_WARMUP_DAYS`、連續失敗斷路器 `PUBLISH_ACCOUNT_FAILURE_LIMIT`（單輪同帳號失敗達上限即跳過其餘並 Telegram 示警）＋跨輪冷卻 `PUBLISH_CIRCUIT_COOLDOWN_MINUTES`（冷卻期內跨 cron 輪次整批跳過該帳號，成功發文即解除）、重發可選 AI 重寫文案、近重複文案偵測、Threads 內容合規（500 字/1 hashtag）、發文 429 退避重試
- [x] 測試：單元（Node 內建 test runner）+ Playwright E2E 整站冒煙/互動（Demo 模式，已入 CI）
- [x] 安全：AES-256-GCM 入庫加密、Cron 安全驗證、SSRF 防護、發文佇列分布式鎖、發文憑證 owner 過濾防越權
```
