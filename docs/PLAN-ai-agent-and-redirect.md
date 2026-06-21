# 規劃書：AI 代理人發文模式 ＋ go2read.link 中轉導流服務

> 狀態：規劃（未實作）。對應現有專案 threadsposhopee（Next.js 14 + Supabase）。
> 兩大新功能：(A) AI 代理人自動產文發 Threads；(B) go2read.link 中轉頁導流（分潤＋來源雙導）。

---

## 〇、合規前提（先讀，影響設計）

參考截圖的服務用「**假 Cookie 同意彈窗**」當觸發器、把分潤連結藏在使用者以為是「同意隱私」的動作後面，屬**欺騙性設計（dark pattern）**：

- **公平交易法 §21**（不實/引人錯誤之表示）、**§25**（欺罔或顯失公平）。
- **Shopee 分潤計畫條款**：多數禁止「誤導性導流／隱藏 affiliate 關係／cloaking」，違反可被取消分潤資格、追回佣金。
- **Threads/Meta 平台政策**：誘導點擊、偽裝連結可致限流或停權。

**本規劃採「揭露但低干擾」版**：中轉頁照樣提供來源內容預覽、照樣賺分潤、體驗一樣順，但**用可見的小標示揭露「含合作推廣連結」**，觸發鈕是誠實的「繼續前往 →」而非偽裝同意。功能與轉換幾乎不打折，法務/平台風險大幅下降。文末附「激進版差異與風險」供你自行取捨。

---

# Part A — AI 代理人發文模式

## A1. 概念

在現有「發文」之外新增第三種來源：**AI 代理人（AI Agent）**。使用者選「人格 × 領域」，系統每日：

1. 依領域抓當日最新新聞/文章（來源 RSS／API）。
2. 簡易去重（跳過近期已寫過的主題）。
3. 用所選**人格**把素材改寫成一篇 Threads 可用貼文（繁中、口吻一致、含 hashtag）。
4. 文末**附上來源出處**（＋可選：來源連結走 Part B 的 go2read 短連結 → 同時賺分潤）。
5. 產出**草稿（一律待人工核准）**，接回現有草稿／防封發文流程。

> 重用現有：`humanizer`（splitCopy/口吻）、`text-similarity`（jaccard 去重）、`materials/drafts` 管線、`publish/queue`（防封節奏）、Apify（owner 已綁）。

## A2. 人格（Persona）系統

每個人格 = 一組 AI 寫作設定，存 DB、使用者可自建：

| 欄位 | 說明 | 範例 |
|---|---|---|
| `name` | 人格名稱 | 「科技宅阿哲」 |
| `tone` | 口吻/風格描述（注入 prompt） | 理性、愛吐槽、用比喻 |
| `domain` | 領域標籤 | tech / health / ai / finance … |
| `emoji_level` | emoji 用量 | none / light / heavy |
| `hashtag_pool` | 慣用 hashtag | #AI #科技 |
| `length` | 目標字數 | 短(100) / 中(200) / 長(400) |
| `source_set_id` | 綁定的來源清單 | → A3 |

預設提供 3–5 個內建人格（科技、健康、AI、理財、生活），可複製改。

## A3. 領域來源（Source Set）

每個領域對應一組「來源清單」。**優先用 RSS（免費、穩定、合法授權摘要）**，其次才考慮付費新聞 API：

- **RSS（推薦預設）**：各領域精選 RSS（科技：iThome/TechCrunch 中文；健康：康健/Heho；AI：Hugging Face blog/機器之心…）。
- **付費 API（選用）**：NewsAPI / GNews（有免費額度），或沿用 owner 的 **Apify**（已綁）跑通用爬蟲。
- 每來源存 `url`、`type`(rss/api/apify)、`enabled`、`weight`。

抓取一律走現有 `fetchWithTimeout` ＋ `assertSafePublicUrl`（SSRF 防護）。

## A4. 去重（簡易、夠用）

三層，任一命中即跳過：

1. **來源層**：`source_item_hash`（來源 URL 正規化後 SHA-1）存表，看過就跳。
2. **主題層**：標題對「近 14 天已產文標題」算 `jaccard`（重用 `text-similarity.ts`），> 0.6 視為重複主題。
3. **成稿層**：產文後對近 14 天貼文正文再算一次相似度，> 門檻則丟棄重產或跳過（呼應現有「近重複偵測」）。

## A5. AI 產文流程

```
for each enabled agent (daily, off-peak):
  items = fetchLatest(agent.source_set, limit=10)
  items = dedup(items)            # A4 第 1、2 層
  pick = rankByFreshness(items)[0]
  draft = gemini.generate(persona=agent, material=pick)   # 重用 humanizer 口吻
  if similarTooHigh(draft): continue   # A4 第 3 層
  draft.body += "\n\n📎 來源：" + sourceLine(pick)   # A6
  createDraft(status="draft", owner, agentId, sourceUrl)   # 待人工核准
```

- **產文 prompt**：注入 persona.tone + 領域 + 來源「標題＋摘要」（**只用摘要不整段複製**，降著作權風險），要求輸出「正文＋（選）留言區」格式，沿用 `splitCopy`。
- **maxDuration / 批次上限**：每 agent 每輪最多產 N 篇（預設 1），吃滿時間預算就停。

## A6. 來源出處（＋分潤掛勾）

文末固定附來源，兩種模式：

1. **純出處**：`📎 來源：<媒體名> <原始連結>`。
2. **導流分潤（推薦）**：`📎 來源：<媒體名> <go2read 短連結>` —— 短連結指向 Part B 中轉頁，使用者照樣讀到原文，過程中曝光分潤。**中轉頁含揭露標示**（見 Part B）。

> 著作權：只引用**標題＋自寫摘要＋出處連結**（合理使用範圍），不轉貼全文、不搬圖。

## A7. 資料模型（新增）

```sql
-- migration 00XX
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  tone text not null default '',
  domain text not null,
  emoji_level text not null default 'light',
  hashtag_pool text[] not null default '{}',
  length int not null default 200,
  source_set jsonb not null default '[]',   -- [{url,type,enabled,weight}]
  threads_account_id uuid,                  -- 預設發哪個帳號（仍待核准）
  enabled boolean not null default false,
  created_at timestamptz default now()
);
create index on ai_agents(owner_id);

create table ai_agent_seen (                 -- 去重記錄
  owner_id uuid not null,
  agent_id uuid not null,
  source_hash text not null,
  title text,
  created_at timestamptz default now(),
  primary key (agent_id, source_hash)
);
-- drafts 增欄：source_agent_id uuid null（標記此草稿由哪個 agent 產生）
```

多租戶：所有查詢帶 `owner_id`（鐵則）。

## A8. 介面

- **發文頁**新增分頁「AI 代理人」：列出 agents（開關、上次產文、下次排程）、「立即產一篇」。
- **代理人設定**：建立/編輯人格、選領域與來源清單、綁發文帳號、開關。
- 產出仍進**草稿頁待審**（沿用勾選式批次核准）。

## A9. 排程

併入現有 `/api/cron/all`：新增 `runAiAgents()` 步驟（冷門時段、分布式鎖保護、每 owner 配額）。serverless/常駐皆沿用現有機制。

## A10. 成本與防呆

- 用**使用者自綁 Gemini 金鑰**（邊際成本歸使用者，與現況一致）。
- RSS 優先 → 幾乎零成本；付費 API 設每日上限。
- 失敗優雅降級、不擋其他 cron 步驟。

---

# Part B — go2read.link 中轉導流服務

## B1. 目標

把「來源連結」換成自有短連結 `go2read.link/r/<code>`。使用者點擊後看到**中轉頁**（來源預覽），按「繼續前往」時：

- 開啟你設定的**分潤連結／App 導流**（蝦皮分潤、可選 App deep link），
- 同時前往**來源網址**，
- 達到「順順導去使用者要看的內容，同時曝光分潤」的效果——**但有揭露、非偷偷**。

## B2. 部署架構（建議）

go2read.link 已在 Zeabur。兩種接法：

| 方案 | 做法 | 取捨 |
|---|---|---|
| **A（推薦）整進現有 Next app** | 在 Zeabur/部署平台把 `go2read.link` 加為現有 app 的網域；新增路由 `app/r/[code]/page.tsx` ＋ API。重用 Supabase、store、SSRF 守衛、分潤連結產生器。 | 最省事、共用資料層與帳號歸屬。建議。 |
| B 獨立微服務 | 在 Zeabur 另開小服務只做轉址，DB 共用 Supabase。 | 多一個服務要維運，無明顯好處。 |

> 用 zeabur MCP 可協助：加網域、設環境變數、部署。

## B3. 短連結資料模型

```sql
create table redirect_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  code text not null unique,            -- 短碼（base62, 6–7 碼）
  source_url text not null,             -- 來源（最終要去的）
  affiliate_url text,                   -- 分潤/App 導流（可即時用金鑰產生）
  title text, image_url text, description text,  -- 中轉頁預覽（抓來源 OG）
  clicks int not null default 0,
  continues int not null default 0,     -- 按「繼續前往」數（分潤曝光）
  created_at timestamptz default now()
);
create index on redirect_links(owner_id);
```

短碼產生：crypto 隨機 base62 ＋ 唯一索引衝突重試（呼應現有 `withNextSlot` 模式）。

## B4. 中轉頁（合規版）行為

`GET go2read.link/r/<code>`：

1. 伺服器查 `redirect_links`，抓不到 → 404。
2. 記一次 `clicks`（去重可選）。
3. 渲染中轉頁：
   - 來源 **OG 預覽卡**（title / image / description）——對使用者有實質價值（知道要去哪）。
   - **明確但低干擾的揭露**：頁面角落一行小字「本頁含合作推廣連結，點擊繼續可能開啟廣告/分潤頁面」。
   - 主按鈕：「**繼續前往 →**」。
4. 按下「繼續前往」：
   - `window.open(affiliate_url, "_blank")`（分潤/App 導流，新分頁/彈窗），
   - 當前頁 `location = source_url`（去來源），
   - 記 `continues`。
5. `affiliate_url` 可**即時產生**（用 owner 蝦皮金鑰 + 商品，沿用現有 `buildSponsorLinkForAccount`/`sponsor/link.ts`），或預存固定分潤連結。

> 安全：`source_url`/`affiliate_url` 寫入前一律過 `assertSafePublicUrl`（SSRF/開放重定向防護）；中轉頁 `target=_blank` 加 `rel="noopener"`。

## B5. App 導流彈窗（你提到的「跳轉 App 彈窗感」）

- 用 deep link（如 `shopee://`）嘗試喚起 App，失敗 fallback 到網頁分潤連結。
- 仍維持揭露；不做「假系統彈窗」。

## B6. 統計

中轉頁/帳號管理顯示每短連結：點擊、繼續率、（若分潤可回拋）轉換。沿用現有 insights 風格卡片。

## B7. 與 Part A／現有發文整合

- AI 代理人/一般發文時，把「來源連結／商品連結」自動建成 `go2read.link/r/<code>` 再放進貼文。
- 對 Threads 而言貼的是 `go2read.link` 自有網域連結（你可控、可統計、可揭露），比直接貼 raw 分潤連結更穩、更不易被判垃圾。

## B8. SEO/OG

中轉頁輸出正確 OG/Twitter card（用 `source` 或自訂預覽），社群分享時有縮圖。`/r/*` 設 `noindex`（避免重複內容）。

---

## 〇-2、激進版（截圖那種）差異與風險（不建議，僅記錄）

| 項目 | 合規版（本規劃） | 激進版（截圖） |
|---|---|---|
| 觸發 | 誠實「繼續前往 →」 | **假 Cookie 同意彈窗**騙點擊 |
| 揭露 | 有小字揭露 | 無，刻意隱藏 |
| 風險 | 低 | 公平法欺罔、Shopee 取消分潤追佣、平台停權、商譽 |
| 轉換 | 幾乎相同 | 略高但不穩、易被檢舉 |

> 結論：建議走合規版。轉換差異有限，但把法務與「被 Shopee 砍分潤資格」的尾端風險拿掉。

---

## 落地順序（建議）

1. **Part B 中轉服務（合規版）**：資料表 ＋ `/r/[code]` ＋ 帳號管理建短連結 ＋ 統計。（基礎建設，AI 代理人會用到）
2. **Part A AI 代理人**：人格/來源資料表 ＋ RSS 抓取 ＋ 去重 ＋ 產文 → 草稿 ＋ 設定 UI ＋ 併 cron。
3. 兩者整合：發文時自動把來源換 go2read 短連結。

每階段照專案規矩：`tsc`/`npm test`/`build` 綠、非平凡邏輯補單元測試、多租戶帶 ownerId、外部 fetch 過 SSRF 守衛、草稿一律待人工核准。
