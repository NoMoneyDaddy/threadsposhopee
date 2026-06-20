# ULTIMATE PROJECT STRATEGY — threadsposhopee 全維度戰略白皮書

> 自動審計產出 · 2026-06-20 · 純唯讀分析，未改動任何業務原始碼
> 方法：4 子代理並行交叉審查（四象限）＋ Git 提交熱點分析＋本機建置/測試感知
> 範圍：`nomoneydaddy/threadsposhopee`（Next.js 14 App Router + Supabase + TypeScript）

---

## 〇、執行摘要（給決策者的 90 秒）

threadsposhopee 是一條「監看來源 → Gemini AI 擬人文案 → 人工核准 → 防封節奏多帳號發 Threads → 延遲補分潤連結 → 成效回收」的全自動分潤發文管線。

**一句話結論：技術骨架是生產級水準，資料層成熟度遠超商業化程度——離可賣的 SaaS 只差「計費層 + 真多租戶化」兩塊地基，產品功能本身已近乎過剩地完整。**

| 維度 | 評級 | 重點 |
|------|------|------|
| 技術防禦力（象限一） | **中上 / B+** | 多租戶 owner 過濾、AES-256-GCM、分布式鎖、原子 CAS 都做對；**1 個高風險 SSRF** 待修 |
| 極端生存力（象限二） | **B+** | 逾時/重試/斷路/降級齊全；**發布等冪缺口**是最尖銳風險 |
| 交付與運營（象限三） | **中下** | `store.ts` God File；log 缺 ownerId context，未達「5 分鐘定位」 |
| 商業化準備度（象限四） | **早期** | owner_id 隔離乾淨、成效數據全採集；**零計費基建**、卡在單一 owner 假設 |

**本機健康度快照**：`tsc --noEmit` 0 錯 · 單元測試 123 pass（23 個 `.test.ts`）· `package-lock.json` 在 · 17 個 migration · 30 條 API route · 9 個頁面 · 生產依賴僅 5 個（供應鏈面積極小）。

**最該先做的 3 件事**：① 修 `expand.ts` SSRF（一行，高風險）→ ② 發布步驟加 `needs_verification` 中間態防重複發文 → ③ 全 log 補 `{ownerId, draftId}` context。

---

## 一、Git 提交熱點分析（歷史 Bug 集中區）

以近一年改動頻率 × `fix` commit 觸及次數定位高風險檔案：

| 檔案 | 總改動 | fix 改動 | 行數 | 風險判讀 |
|------|:---:|:---:|:---:|------|
| `src/lib/store.ts` | 25 | 11 | **1489** | 🔴 God File + 最高 bug 密度，是全專案風險中心 |
| `src/services/publish/queue.ts` | 12 | 7 | 279 | 🟠 防封核心邏輯，巢狀深、改動風險外溢 |
| `src/components/LiveDashboard.tsx` | 9 | 6 | 441 | 🟡 最大前端檔，UI 狀態聚合 |
| `src/app/api/compose/route.ts` | 7 | 5 | 203 | 🟡 文案生成入口，外部 AI 邊界 |
| `src/app/accounts/page.tsx` | 10 | 5 | 150 | 🟡 憑證自綁入口 |
| `src/app/api/cron/publish/route.ts` | 6 | 4 | — | 🟡 排程觸發點 |

**判讀**：bug 高度集中在「資料層 + 發文佇列」這條主動脈。`store.ts`（25 改/11 fix）與 `queue.ts`（12 改/7 fix）兩檔吃下全專案近半數修復——**任何重構投資都應優先押在這兩個檔**，邊際收益最高。

---

## 二、象限一：技術防禦力與隱形風險

### 🔴 高風險

**H1｜SSRF：`expandShopeeLink` 未過 `assertSafePublicUrl`** — `src/services/shopee/expand.ts:27`
- **技術成因**：`fetchWithTimeout(shortLink, { redirect:"manual" })` 直接 fetch 使用者輸入的連結，是全專案唯一漏掉 URL 守衛的外呼點。資料流：任何已登入 member → `POST /api/materials` → `resolveMaterialFromUrl` → `expandShopeeLink`。攻擊者可送 `http://169.254.169.254/...` 或內網位址做 SSRF 探測。
- **影響**：內網探活/打內部 HTTP 服務；違反 CLAUDE.md「外部 fetch 一律先過 `assertSafePublicUrl`」鐵則。
- **修復**：fetch 前加 `assertSafePublicUrl(shortLink)`；對 `location` 二次 fetch 亦需再驗。**一行收斂，最高優先**。

### 🟠 中風險

**M1｜GraphQL 字串拼接 `scrollId`** — `src/services/shopee/report.ts:53-54`
- 成因：`scrollId` 直接內插進 query 模板（未參數化）。來源是 Shopee 自家回傳（非使用者輸入），實際可利用性低，屬規範性瑕疵。
- 修復：改 `variables: { scrollId }`，與 `affiliate.ts` 已正確參數化的寫法一致。

**M2｜依賴版號全用 `^` 浮動** — `package.json`
- 成因：除 `next:14.2.5` 固定外，其餘皆 caret。**有 `package-lock.json` 兜底**，風險降為中。
- 修復：CI 改用 `npm ci`（鎖檔精確還原）；排程升 Next.js 14.2 最新 patch（14.2.5 偏舊，期間有安全修補）。

### 🟢 低風險（佐證良好設計）

- **授權合規零風險**：5 個生產依賴（next/react/react-dom/@supabase ×2）全 MIT；devDeps 全 MIT/Apache-2.0。**未發現任何 GPL/AGPL/LGPL**。
- **XSS 未發現**：無 `dangerouslySetInnerHTML`/`eval`/`new Function`。
- **金鑰零明文洩漏**：`crypto.ts` AES-256-GCM 正確（隨機 IV + authTag + 金鑰長度檢查）；`console.*` 只印錯誤物件不印 token；`has*Credentials` 只回布林。
- **多租戶 owner 過濾無越權缺口**：所有資料函式吃 `ownerId` 並 `.eq("owner_id", ...)`；`getThreadsCredentials`/`userOwnsThreadsAccount` 帶 owner 過濾；背景 worker 對 `owner_id=null` 者略過。
- DRY：Shopee GraphQL 呼叫在 `affiliate.ts` 與 `report.ts` 重複兩份，建議抽 `callShopeeGql()`。

---

## 三、象限二：極端生存力與 AI 準備度

### 🔴 高風險

**H2｜發布步驟無等冪鍵，5xx 時無法區分「真失敗」與「已發但回應遺失」** — `src/services/threads/publish.ts:62-74, 126-131`
- **成因**：`threads_publish` 只對 429 退避，5xx/網路錯誤故意不重試（避免重複），但呼叫端直接標 `failed` 並計入斷路器。Threads 可能已發布成功 → 人工/批次重試造成**重複貼文 → 觸發垃圾防護 → 封號**。
- **修復**：失敗（非 429）改標 `needs_verification` 中間態，重試前先用近期貼文查詢去重；告警文案明示「可能已發出，請先確認」。**這是全系統最尖銳的韌性缺口**。

**H3｜SSRF（同象限一 H1）** — `expand.ts:27`（兩個子代理獨立指認，提升可信度）

### 🟠 中風險

| 編號 | 問題 | 檔案 | 修復方向 |
|------|------|------|----------|
| M3 | 斷路器僅「單輪單帳號」記憶體計數，壞帳號每輪重新試探 N 次，無跨輪冷卻 | `queue.ts:84,121` + `cadence.ts:94` | 連續多輪觸發→標帳號 `error` 或寫 `circuit_until` 時戳 |
| M4 | 輪播多子容器發文非等冪，中途失敗殘留孤兒容器、重試重發 | `publish.ts:112-124` | 註解/告警標註；子項數設上限 |
| M5 | Gemini/Apify 失敗無重試（429 也不退避） | `gemini.ts:84`、`scraper/threads.ts:77` | 對 429 加一次退避（複用 Threads 模式） |
| M6 | 影片容器輪詢最長 40s × 多子項，逼近 `maxDuration=60` | `publish.ts:84-99` | 影片輪播子項上限 / 縮短輪詢 |

### 🟢 韌性評分表

| 依賴 | 逾時 | 重試 | 等冪 | 降級 | 評分 |
|---|:---:|:---:|:---:|:---:|:---:|
| Threads 發文 | ✅8s | ⚠️僅429 | ⚠️**無等冪鍵** | ⚠️留言失敗不擋主文 | **B** |
| Threads token refresh | ✅ | ❌ | ✅ | ✅停排程 | **B+** |
| Shopee GraphQL | ✅ | ❌ | ✅ | ✅驗證放行 | **B+** |
| Shopee expand | ✅ | ❌ | ✅ | ✅退回原連結 | **C**（缺SSRF） |
| Gemini | ✅30s | ❌ | ✅ | ✅純文字降級 | **B** |
| Cloudinary | ✅20s | ❌ | ⚠️重傳產重複 | ✅沿用原URL | **B** |
| Apify | ✅45s | ❌ | ✅去重 | ✅該輪略過 | **B** |
| Telegram 告警 | ✅ | ❌ | N/A | ✅絕不拋 | **A** |

### AI 準備度（高分）

- 目錄結構標準（`services/<domain>/`）、`types.ts` 僅 96 行 union literal、**全庫僅 5 處 `: any`**（都在外部 JSON 邊界）。
- **23 個測試錨定關鍵邏輯**（cadence/queue/url-guard/crypto/sign/publish）；demo fixtures 讓 AI 零配置測試完整流程。
- 註解多為「為什麼」級（防封取捨、`ponytail:` 標記）。**唯一結構債＝ `store.ts` 過大**。

---

## 四、象限三：團隊交付與營運體驗

### 🔴 高風險（運維可觀測性）

**H4｜多租戶 log 普遍缺 `ownerId`/帳號 context** — `store.ts:350,488,523,1421,1447`
- 成因：解密失敗等 5 處 `console.error` 只印 `r.id`/`r.label`，**不含 ownerId**。
- 影響：線上爆「某用戶發文全失敗」時，運維看 log 只見「解密失敗」卻無法定位哪個 owner → **達不到 5 分鐘定位目標**，需反查 DB。

**H5｜無結構化日誌** — 全庫 36 個 `console.*`（0 個 `console.log`，噪音控制好）但全為自由字串，無 trace id/level/JSON。
- 影響：無法在 log 平台依 ownerId/draftId 過濾聚合，災情只能 grep 中文字串。
- 修復：引入單一 `logger(level, msg, ctx)` wrapper（ponytail：一個函式，不引重型依賴），強制帶 context。

### 🟠 中風險

- **M7｜`runAllSources` 循序硬失敗**（`pipeline/run.ts:138`）：逐源 `await` 無 try/catch，單一來源拋錯中斷整批後續——與 `cron/all` 的 allSettled 精神相違。
- **M8｜7 處靜默吞錯 `catch(()=>{})`**：釋放鎖失敗（`queue.ts:64`）無 log → 下輪卡 `lockBusy` 至 TTL 過期難察覺。
- **M9｜sendAlert 覆蓋率低**（10 處 3 源頭）：爬蟲 per-post 失敗只進 `result.notes` 不告警。

### God Files 解耦工時表（PM 視角）

| 檔案 | 行數 | 衝突風險 | Story Points | 拆分方向 |
|------|:---:|:---:|:---:|------|
| `src/lib/store.ts` | 1489 | **極高** | **13** | 按領域切 `store/{credentials,drafts,publish-queue,accounts,stats,app-state}.ts`，共用 helper 留 `_client.ts`；分多次小 PR 降衝突 |
| `src/services/publish/queue.ts` | 279 | 高 | **3** | 抽 `shouldSkipDraft(draft,state,counters): SkipReason\|null` 純函式集中 8 道守衛（可單測），主迴圈瘦身 |
| `src/components/LiveDashboard.tsx` | 441 | 中 | **5** | 按 widget 拆子元件 + 資料抓取 hook |
| `src/app/insights/page.tsx` | 275 | 中 | **2** | 抽圖表區塊元件 |
| `src/components/DraftCard.tsx` | 267 | 中 | **2** | 抽 action 列 + 編輯表單 |

> **亮點**：`queue.ts` 雖巢狀深，但**商務邏輯中文註解密度高**（防封/斷路/冷卻取捨都解釋清楚），顯著緩解接手難度——是本專案 DX 的最大優點。

---

## 五、象限四：MVP 商業化與 Phase 2 深度發想

### 產品逆向工程

- **核心價值**：把「Threads 大量發 Shopee 分潤文」這件高勞力、高封號風險的事，收斂成全自動管線。壁壘＝內建 Shopee HMAC 簽名（去外部相依）+ humanizer 去 AI 腔 + 完整防封旋鈕 + 各人自綁加密憑證。
- **目標用戶**：中小型蝦皮分潤聯盟主／團媽／導購 KOC，手握多 Threads 帳號要規模化又怕封號。
- **已揭露的雙層結構**：`owner`（綁爬蟲+共用 Shopee 金鑰）vs `member`（自綁 Gemini/Threads/Cloudinary）——天然是「單一營運者帶一群操作員」雛形，適合 SaaS/代理商模式。
- **明確「沒做」的業務邊界**：零計費/訂閱/用量計量；單一 owner 模型（`getOwnerUserId` 靠 env email + 程序快取）非真多租戶；通知僅單向全域 Telegram；AI 僅單篇生成。

### 🔑 關鍵發現：多租戶與計費的銜接點

> owner_id 隔離已徹底（每個 store 函式都吃 `ownerId`），**資料層幾乎可直接支撐 per-tenant 計費**。兩個硬阻塞：
> (a) `getOwnerUserId()` 是 env 單一 owner + 全程序快取 → SaaS 須改成「每個付費帳號自己是 owner」；
> (b) 防封節奏是 env 全域常數（`publishMaxPerDay` 等）→ 計費分級要下放成 per-owner 方案參數存 `profiles`。

### PMF 橫向擴展（精選）

| 功能 | 商業價值 | 難度 | 動到的模組 |
|------|:---:|:---:|------|
| 內容日曆 + 缺稿預警（佇列見底主動催補） | 高 | 低 | `getPublishPlan`、`daily.ts` |
| 素材成效回灌排序（賺錢的自動優先再發） | 高 | 中 | `report.ts`、materials 表 + `revenue_score` |
| 帳號健康分儀表板（觸及驟降+token+失敗率彙整） | 中 | 低 | `reach.ts`、`getDashboardStats` |
| 瀏覽器擴充：一鍵收商品進素材庫 | 高 | 中 | 新 ingest API、`materials/build.ts` |
| 多人協作角色（審稿/發文分權） | 中 | 高 | `auth.ts`、RLS、`profiles.role` |

### AI 智能增長點（資料源都已具備，只差餵回決策）

| 功能 | 價值 | 難度 | 論證 |
|------|:---:|:---:|------|
| 成效歸因 AI 摘要（每日「為什麼掉+怎麼辦」） | 高 | **低** | `daily.ts` 已蒐齊 JSON，丟 LLM 即得，邊際成本極低 |
| AI 選品（從佣金報表挑高轉換品自動建草稿） | 高 | 中 | `report.ts` byItem 已有佣金數據 |
| A/B 文案（一品多版 + insights 回灌勝出） | 高 | 中 | 生成已參數化，`engagement.ts` 可判勝 |
| 最佳時段自動套用（從建議升級為自動排程） | 高 | 中 | `insights.ts`/`slots.ts` 已算，差接進排程器 |
| AI 內容合規預檢（語意級廣告農場偵測） | 中 | 低 | 升級 `queue.ts` 既有硬規則 |

---

## 六、影響力 vs 執行難度 ROI 矩陣

> 技術重構（🔧）與新功能/商業化（💰）混合排列。象限以「影響力 × 執行難度」定位。

```
影響力 高
  │  ┌─────────────────────────┬─────────────────────────┐
  │  │  ★ 速贏 (Quick Wins)      │  ◆ 大賭注 (Big Bets)      │
  │  │  低難度 · 高影響          │  高難度 · 高影響          │
  │  │                          │                          │
  │  │ 🔧 H1 修 expand SSRF(1行) │ 💰 真多租戶化(移除單owner) │
  │  │ 🔧 H4/H5 log 補 context   │ 🔧 store.ts God File 拆解  │
  │  │ 🔧 M2 CI npm ci+Next升級  │ 💰 計費系統串接(金流webhook)│
  │  │ 💰 成效儀表板+AI摘要付費牆 │ 🔧 H2 發布等冪(needs_verify)│
  │  │ 💰 env防封常數→方案分級    │ 💰 自動回覆私訊 Agent      │
  │  │ 💰 內容日曆+缺稿預警       │                          │
  │  ├─────────────────────────┼─────────────────────────┤
  │  │  ○ 填空 (Fill-ins)        │  ▽ 緩議 (Thankless)       │
  │  │  低難度 · 中低影響        │  高難度 · 中低影響        │
  │  │ 🔧 M1 scrollId 參數化     │ 🔧 LiveDashboard 拆元件    │
  │  │ 🔧 M5 Gemini/Apify 429重試│ 💰 多人協作角色分權        │
  │  │ 🔧 M7 runAllSources try   │ 💰 瀏覽器擴充採集          │
  │  │ 🔧 M8 空catch補warn       │                          │
  │  │ 💰 AI內容合規預檢         │                          │
  │  └─────────────────────────┴─────────────────────────┘
影響力 低 ────────────── 執行難度 ────────────────────► 高
```

**ROI 排序前 5（先做）**：
1. 🔧 **H1 修 SSRF**（1 行 / 高安全影響）— 立即
2. 🔧 **H2 發布等冪 `needs_verification`**（中工 / 防重複發文＝防封）— 立即
3. 🔧 **H4+H5 結構化 log + ownerId context**（低工 / 解運維盲區）— 立即
4. 💰 **env 防封常數下放成 per-owner 方案參數**（低工 / 即刻可分級訂閱）— 變現起手式
5. 💰 **成效儀表板 + AI 歸因摘要設 Pro 付費牆**（低工 / 最強付費動機）

---

## 七、Phase 1–3 演進路線圖

### Phase 1：穩固地基（1–2 週）— 安全與可觀測性
**目標**：消除高風險、達成「5 分鐘定位」運維標準，不加新功能。
- [H1] `expand.ts` 補 `assertSafePublicUrl`（SSRF）
- [H2] 發布失敗改 `needs_verification` 中間態 + 重試前去重查詢
- [H4/H5] 引入 `logger(level,msg,ctx)` wrapper，全 `console.error` 補 `{ownerId,draftId,accountId}` + JSON 化
- [M2] CI 改 `npm ci`、排程升 Next.js patch
- [M1/M5/M7/M8] scrollId 參數化、429 退避、`runAllSources` per-source try/catch、空 catch 補 warn
- **驗收**：tsc 0 + 測試全綠 + 模擬災情可由 log 5 分鐘定位受影響 owner

### Phase 2：可維護性 + PMF 留存飛輪（3–6 週）
**目標**：拆 God File 降協作摩擦；補上形成習慣的功能鉤子。
- [13 SP] `store.ts` 漸進式領域拆分（多次小 PR）+ [3 SP] `queue.ts` 抽 `shouldSkipDraft`
- [M3] 斷路器跨輪記憶（`circuit_until`）
- 內容日曆 + 缺稿預警（getPublishPlan 反向告警）
- 素材成效回灌排序（report.ts 佣金 → revenue_score）
- 帳號健康分儀表板（reach.ts + stats 彙整）
- 成效歸因 AI 摘要（daily.ts JSON → LLM）
- **驗收**：最大檔 < 500 行；DAU 留存鉤子上線

### Phase 3：商業化引擎 + 真多租戶 SaaS（6–12 週）
**目標**：從「自用工具」到「可規模銷售 SaaS」。
- 💰 **真多租戶化**（戰略前置）：改造 `getOwnerUserId`/`cron/all`，每個付費帳號自成 owner；cron 遍歷所有付費 owner
- 💰 `profiles` 加計費欄位（plan/status/quota/period）+ 用量計量（getDashboardStats 已有數據源）
- 💰 env 防封常數下放成 per-owner 方案參數（免費鎖小 / Pro 放開暖機·斷路·分片並行）
- 💰 計費串接（Stripe / 綠界 / TapPay）+ webhook 回寫 `profiles.plan`
- 💰 `notify.ts` 多通道（Slack/LINE/Discord/Webhook，per-owner channel 註冊表）
- 💰 AI 選品 + A/B 文案 + 最佳時段自動套用（付費牆素材）
- **驗收**：可同時服務 N 個付費 owner，各自計量計費、各自方案上限生效

---

## 附錄：審計依據

- **建置/測試感知**：Node v22 · `tsc --noEmit` exit 0 · 單元測試 123 pass / 0 fail（`node --import tsx --test`）· 23 個 `.test.ts` · `package-lock.json` 存在 · 17 個 SQL migration（至 `0017_reply_delay.sql`）· 30 條 API route · 9 個頁面。
- **依賴**：prod 5（next 14.2.5 固定、react/react-dom/@supabase ×2 caret）；dev 9（全 MIT/Apache-2.0）。
- **方法論**：四象限子代理並行唯讀審查 + Git `--name-only` 熱點統計 + `wc -l` God File 定位 + ripgrep 危險模式掃描。

> ⚠️ **安全鐵律遵守聲明**：本報告為純審計與規劃，**未改動任何業務原始碼**。任何 Phase 1–3 實作項目，均待你明確授權後才動工。
