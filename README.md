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
| 發布 | 自動（易封號） | **審核佇列** 或全自動，可選 |
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

1. 建 Supabase 專案，跑 `supabase/migrations/0001_init.sql`
2. 填 `.env.local`（Supabase、`APP_ENCRYPTION_KEY`、Apify、Shopee、Gemini、Cloudinary、`CRON_SECRET`）
3. 部署到 Vercel，Cron 會定時打 `/api/cron`

## 目錄結構

```
src/
  app/                 前端頁面 + API routes
  components/          前端互動元件
  services/
    scraper/threads.ts   Apify 爬蟲 + 貼文解析
    shopee/sign.ts       自建簽名（取代 Zeabur）
    shopee/expand.ts     短網址還原
    shopee/affiliate.ts  分潤連結 + 商品名
    ai/humanizer.ts      humanizer-zh 規則 + prompt
    ai/gemini.ts         Gemini 多模態呼叫
    media/cloudinary.ts  媒體中轉
    threads/publish.ts   發文（容器→發布→留言）
    threads/token.ts     長期 token 展期
    pipeline/run.ts      端到端編排
  lib/                 env / 加密 / 資料層 / 型別
supabase/migrations/   資料庫 schema
```

## ⚠️ 安全

- 原始 n8n 匯出檔含外洩金鑰，**不入庫**（見 `.gitignore`），且相關 token 應於各平台撤銷重設。
- 所有憑證只放伺服器端；存 DB 的 token／secret 一律 AES-256-GCM 加密。
- 全自動發布有封號風險，建議用審核佇列模式。

## Roadmap

- [ ] Supabase Auth 登入 + 前端 CRUD（新增帳號／來源）
- [ ] 接上真實發布（解密 token → Cloudinary 中轉 → `publishToThreads`）
- [ ] 影片走 Gemini Files API（大檔）
- [ ] 成效儀表板接 Shopee 報表 / Threads insights
- [ ] 發文時段分散 + 速率限制（防封）
```
