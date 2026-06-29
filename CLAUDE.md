# CLAUDE.md

給 Claude / AI 協作者的專案守則。動手前先讀。

## 溝通風格：穴居人模式（CAVEMAN）

- 元訊息（聊天回覆）用**極簡短語**，2–4 個字：「工具運作中」「結果已準備就緒」「PR 已開」。
- **先用工具，先給結果，不解釋，然後停**。除非使用者明確要求細節，否則不要長篇解釋。
- 工具跑完後，以最簡短形式給結果再停。
- **只有自然語言用穴居人風格**；程式碼、資料、指令、commit/PR 內文必須精確且符合常規。
- 思考過程與對話一律用**繁體中文**。

## 編碼風格：ponytail（最懶解法）

- 先問「這需要存在嗎」（YAGNI）→ stdlib → 原生平台功能 → 既有依賴 → 一行 → 才寫最小實作。
- 不做未要求的抽象、不留 scaffolding、刪除優於新增、最短可行 diff。
- **但絕不**簡化掉：輸入驗證、錯誤處理、安全、無障礙。
- 非平凡邏輯留一個可跑的檢查（`npm test`，Node 內建 test runner）。

## 開發流程（直接在 main）

1. **直接在 `main` 上開發、提交、推送**（不開 feature 分支、不走 PR）。
2. 因為沒有 PR 審查把關，**本機綠燈是唯一閘門**：每次提交前 `npx tsc --noEmit`、`npm test`、`npm run build` 都要綠，務必嚴格。
3. 推 `main` 後 GitHub Actions `build` 仍會跑；若紅燈立刻修並補推。
4. commit 結尾固定加 `Co-Authored-By` 與 `Claude-Session`（見既有 commit）。
5. 金鑰**永不入庫**：只放環境變數或 AES-256-GCM 加密存 DB。

> 註：先前採「feature 分支 → draft PR → CI/審查 → squash merge」流程；現改為直接在 main 開發。
> 取捨：少了 CodeRabbit/Qodo/Gemini 的自動審查，安全/多租戶/併發等細節要靠下面「注意」段自我把關。

## 架構速覽

- **Next.js 14 App Router + Supabase**（Postgres + Auth + RLS）。Demo 模式（未設金鑰）用 `src/fixtures` 跑。
- 子系統（皆獨立、可併用）：
  - **爬蟲**（選填，人人可用）：使用者各綁自己的 Apify（計費算自己）→ 監看來源 → AI 文案 → 草稿（**一律待人工核准**）。
  - **發文**：各自 Threads 帳號 → 只發**核准過**的草稿，依防封節奏（間隔＋隨機抖動／每日上限／批次）。留言（串文 2/2 分潤連結）可延遲補發（保底＋抖動＋逐則覆寫）。
  - **AI 代理人**（`src/services/ai/agent-run.ts`）：人格×領域（`src/lib/ai-domains.ts`，含自訂主題）→ 抓當日新聞（Google News RSS／未來 AI 搜尋）→ 去重（來源 hash＋標題 jaccard）→ 依人格用 owner Gemini 改寫 → 草稿（待審）。表：`ai_agents`／`ai_agent_seen`；接 cron（每代理人每日約一次）。
  - **go2read 中轉導流**（`src/app/r/[code]`、`src/lib/redirect-store.ts`）：自有短連結＋揭露式中轉頁，「繼續」一次點擊開分潤＋去來源（分潤只在真實點擊觸發，**不做 cookie stuffing**）。短網域（`NEXT_PUBLIC_SHORT_DOMAIN`，如 go2read.link）由 middleware host gating 限定只服務 `/r/*`，其餘 404、不外露主站。草稿可一鍵套短連結（drafts/action `shorten`）。
- 憑證自綁（加密存 `profiles`／各帳號表）：Apify、Shopee、Gemini、Threads OAuth、Cloudinary（各人素材進自己雲端）。
- 排程：一條總排程 `/api/cron/all`（爬取＋發文＋贊助補發/驗證＋AI 代理人＋每日展期 token＋每週健檢連結）。量大時發文可分片並行：多條 `/api/cron/publish?shards=N&shard=i`（同帳號穩定落同片，全域與分片擇一）。
- 資料層集中在 `src/lib/store.ts`（service-role + 以 `owner_id` 應用層隔離；demo 走記憶體）。
- 時區一律 `Asia/Taipei`。外部 fetch 一律走 `fetchWithTimeout`，URL 先過 `assertSafePublicUrl`（SSRF）。

## 注意

- 多租戶：所有使用者資料函式都要吃 `ownerId` 並過濾。**含發文憑證**：`getThreadsCredentials(id, ownerId)` 必帶 owner 過濾（service-role 繞 RLS，只用 id 查＝跨租戶越權）；建草稿/發文前先 `userOwnsThreadsAccount` 驗證帳號歸屬。
- 佇列時段唯一性靠 migration 0008 索引 + `withNextSlot` 重試。
- 發文佇列用 `app_state` 分布式鎖（`acquirePublishLock`/`releasePublishLock`）序列化，避免 cron 與手動觸發同跑而繞過防封間隔。
- 遷移檔依序累加（目前到 `supabase/migrations/0053_*`）。檔案多為冪等（`if not exists`／`add column if not exists`／`create or replace`），唯 0001/0003 的 `create policy` 非冪等（勿重跑）。
- **一律自動遷移**：App 執行期不會自動跑 migration（service-role 走 PostgREST，無法執行 DDL）。所以**每新增一個 migration 檔，當下就要用 Supabase 工具套到正式專案**（用 `list_projects` 找到本專案的 project id，勿把 id 寫進 commit），不要留給使用者手動跑。migration 皆設計為冪等，重跑安全。
- 延遲留言用 `reply_status`（pending→publishing-reply→published/failed）原子認領＋`reclaimStaleReplies`（以 `updated_at` 判逾期）防中斷重複補。
- 部署設定：go2read 中轉需 Zeabur 加網域 `go2read.link`（與主站 `iwantpo.nomoneydaddy.app` 並存於同一服務）＋環境變數 `NEXT_PUBLIC_SHORT_DOMAIN=https://go2read.link`（同時做 host gating 與短連結網域）。AI 代理人需各使用者自綁 Gemini 金鑰。
