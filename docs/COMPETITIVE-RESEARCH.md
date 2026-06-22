# IwantPo 競品研究與優化報告

> 由 8 個調查代理（5 研究競品 × 3 評判優缺點/不足）並行產出後彙整。
> 對標範圍：社群排程 SaaS（Buffer / Publer / Postiz / Metricool / SocialBee / Vista Social）、
> 創作者工具（Typefully / Hypefury / Taplio）、分潤連結/轉址（Pretty Links / Geniuslink / Bitly / Linktree / 蝦皮原生）、
> AI 內容（ContentStudio / FeedHive / Taplio）、開源自架（Postiz / Mixpost / Socioboard）與台灣蝦皮分潤利基。

---

## 一、一句話定位（結論先行）

**IwantPo 應主打「台灣蝦皮分潤創作者的 Threads 防封自動發文＋佣金歸因閉環」**——不做大而全的多平台排程器，做沒人敢碰、也沒人做得深的「單一高風險平台 × 單一在地分潤生態」垂直工具。

---

## 二、IwantPo 的真正差異化（競品難複製）

1. **「Threads 防封節奏」是工程級護城河，不是設定開關。** 競品的「最佳時段」是優化觸及；我方的是**保命**（連續失敗斷路器＋冷卻、批次上限、新帳號暖機遞增、最小間隔＋穩定抖動、分布式鎖序列化、觸及驟降偵測）。Buffer/Publer/Hypefury 都「到點就發」，因為它們不靠單一高風險平台吃飯。
2. **端到端「蝦皮分潤閉環」內建。** 爬連結→subId 歸因（帳號×商品×來源）→Shopee GraphQL 即時生連結→發文→延遲補留言→拉 conversionReport 回算每帳號/商品/來源佣金→CSV。Geniuslink 只做連結點擊、Linktree 只做 bio，沒人閉合到「實際蝦皮佣金歸因」。
3. **全鏈路自綁金鑰（BYO-key）＋多租戶。** 每人自綁 Apify/Shopee/Gemini/Threads/Cloudinary、AES-256-GCM 加密、owner_id 應用層隔離。Postiz 開源至今（Issue #975）仍缺「逐租戶外部憑證注入」——這正是我方現成優勢。
4. **go2read 揭露式中轉：合規導流、不做 cookie stuffing。** 真實點擊才開分潤、有揭露、無隱藏層，把「合規」當信任資產（多數分潤工具靠灰色 cloaking 衝量）。
5. **AI 代理人「人格×領域×每日新聞改寫」自動養號。** 24 領域免金鑰 RSS＋兩層去重（hash＋jaccard）＋人格化改寫→待審草稿，用非業配內容維持帳號活躍、降低被判純廣告號的風險。競品 AI 只生單篇文案，沒有「為養號而持續產內容」的意圖設計。

---

## 三、各區段競品最值得借鑑的做法

### A. 社群排程（Buffer / Publer / Postiz / Metricool / SocialBee / Vista Social）
- **發文目標→自動生成時段佇列（Buffer）**：使用者只選「每週發幾次」，系統自動鋪 slot，排程只丟進下一個空位。可把我方防封節奏包成「每週目標」一鍵生成佇列，租戶零心智負擔。
- **分類桶＋常青 Re-Queue 迴圈（SocialBee）**：核准草稿分主題桶、各桶設節奏、常青桶輪播回收。補我方「待審草稿池→穩定不間斷發文」缺口，天然契合 owner_id 隔離與每日上限。
- **三種自動化並存（Publer）**：Queue / Recycle / Recurring；Spintax 變體避免重複觀感。
- **逐平台/逐帳號預覽＋串文 reply chain 規劃（Postiz）**：主貼＋整串回覆一次排好、父貼發出後自動依序補發——正對應我方「串文 2/2 分潤連結延遲補發」，可做成核准前一體化編輯＋預覽，沿用 500 字即時校驗。
- **Best-Time 深淺色日曆格、點擊即排（Metricool）**：用各租戶 Threads 自身互動數據算熱門時段，疊在「間隔＋抖動上限」同一視覺層，在合規節奏內挑最優時段。
- **免登入分享連結審核（Vista Social）**：產帶到期日+密碼的唯讀日曆連結、開「可核准」，owner/客戶免帳號即可核准草稿——完美契合「草稿一律待人工核准」。
- **帳號層級「需審批」旗標＋審批佇列（Publer/Buffer）**：把核准狀態綁在每個 Threads 帳號（full / 待核准），多租戶天然落地。

### B. 創作者撰寫器與 AI（Typefully / Hypefury / Taplio）
- **長文一鍵 Auto-Split 成串文＋自動編號（1/n）＋所見即所得預覽（Typefully）**：我方撰寫器最缺這塊。
- **學個人語氣的改寫（Typefully/Claude 模式）**：用 owner 過往「已核准草稿」當 few-shot，讓 Gemini 改寫貼近其人格聲音（解決 AI「通用無臉感」最大痛點）。
- **Hook Generator 一次出多個風格鉤子、一鍵帶入續寫（Taplio）**：AI 代理人改寫新聞時先出多鉤子讓 owner 挑，提升核准率。
- **門檻觸發式 Auto-Plug（Hypefury/Typefully）**：貼文達 N 讚才自動補「2/2 分潤連結」留言——強化既有延遲留言，且只在真實熱度觸發、避免 spam。

### C. 分潤連結／轉址（Pretty Links / Geniuslink / Bitly / Linktree / 蝦皮原生）
- **中轉頁＝FTC 認可的揭露資產**：把 go2read 揭露文案做成「clear & conspicuous、購買前可見、明寫『含蝦皮分潤連結』」，是相對 Bitly/Geniuslink 的護城河。
- **優先喚起蝦皮 App（Geniuslink deep link）**：行動裝置點「繼續」走 deep link 喚 App，分潤歸因更穩、轉換更高；喚不起再 fallback web。
- **多維 Sub_id 對齊蝦皮原生 5 格**：把 `sp_<帳號碼>` 擴成結構化 subId（帳號／渠道／貼文／活動）並做點擊報表（依維度篩選＋匯出），補上目前缺的報表層。
- **中央管理改一次全站生效＋失效連結健康告警＋缺貨備援（Pretty Links / Choice Pages）**。
- **link-in-bio 延伸（Beacons/Linktree）**：把多條 sp_ 短連結聚合成可變現 bio 頁，作為發文外第二觸點。
- **條件式 cloaking 開關（ThirstyAffiliates）**：保留「揭露式、可關閉 cloaking」彈性以因應平台 ToS 差異。

### D. AI 內容自動化（ContentStudio / FeedHive / Taplio）
- **RSS 自動化頻率與三種落點（ContentStudio）**：每 5–30 分檢查、可選「即發 / 加入佇列 / 加入分類」。我方可在 AI 代理人加「加入佇列」選項（仍待審）。
- **Post Recycling 依「表現×年齡」挑回收、給潛力貼第二次機會（FeedHive）**：對應素材庫「收益排序＋再排」，加自動回收規則即可。
- **Conditional Posting 條件式補留言（FeedHive）**：依互動/時間/讚數自動掛 plug/followup——比我方延遲留言觸發更豐富。
- **magic-link 免登入審核 + Anyone/Everyone 多審核者 + force publish（ContentStudio）**：成熟的核准子系統參考。
- **變體「附加到末端」而非取代（ContentStudio/Taplio）**：一稿多版本管理思路。
- **人格＝few-shot 範例，非只給形容詞**：讓使用者貼 3–5 篇自己/目標風格貼文當 examples（ABOUT ME＋EXAMPLES＋INSTRUCTIONS），比單選「八卦人格」更像本人，提升核准率。
- **字數是 LLM 死角，必須程式硬卡**：Threads 上限請在改寫後用程式截斷/重生，prompt 不可信。
- **逐句溯源防幻覺**：新聞改寫對冷門/近期題材幻覺率高，最危險是「可信的細節錯誤」（人名/日期/引述）。在草稿旁顯示原文連結與被引段落，審核者一眼可核對。
- **批次審核（List View＋勾選 Bulk Actions）**：AI 代理人每日量產多草稿，需批次核准/退回，別逐則點。
- 註：ContentStudio/FeedHive/Taplio/Postiz/Ocoya/Predis 幾乎都**無原生 RSS 去重、無 AI 人格庫、介面多僅英文**——而我方的「來源 hash＋標題 jaccard 去重」＋「一律人工核准」正是對抗「AI slop」的業界核心建議，幾乎無競品內建，值得在行銷上明說。

### E. 開源自架與台灣利基（Postiz / Mixpost / 蝦皮分潤生態）
- **BYO-key 是最大差異化**：Postiz #975 證明逐租戶外部憑證是市場缺口；主打「每人自綁、加密自管、金鑰不離庫」。
- **變現可學 Mixpost**：一次性授權/白標 SaaS（Enterprise 計費）無月費，搭配我方自架輕量（Supabase vs Postiz 的 Temporal）。
- **防封界線要明確**：Meta 真正連坐靠**裝置指紋/IP/IG 身分**；工具只控發文節奏，**不該也不能代理 anti-detect 規避**——多帳號用戶須各自獨立網路環境。
- **養號風險須明示免責**：多帳號自互點分潤**無效且違規**，文案/條款應警示。
- **警惕 Socioboard 老化**：保持 UI 現代、依賴精簡。

---

## 四、UX / 資訊架構摩擦點（C1 評審摘要）

整體：**功能完整、文案誠意高、空狀態普遍有 CTA、無障礙基礎扎實**。三大痛點：

| 重要度 | 問題 | 建議 |
|---|---|---|
| 高 | **首篇發文路徑過長**：發一行字前要綁 Threads＋Gemini＋Cloudinary（皆必填、需外部帳號） | Cloudinary 降為「上傳圖片才需要」、純文字直推只需 Threads；引導卡分「發第一篇必需」與「進階」 |
| 高 | **命名雙軌不一致**：導覽叫「文章管理／成效分析／轉址服務」，頁面 H1 卻是「草稿／成效／短連結」，次分頁「手動發文」vs H1「發文」 | 擇一白話詞貫穿導覽＝H1＝次分頁（零邏輯風險的字串改動） |
| 高 | **撰寫頁資訊密度爆量**：連結發文＋自寫＋批次三表單堆疊 | 頁內 tab 分流、預設只露主流程；進階選項摺疊 |
| 中 | 「自動駕駛」需手動到 Zeabur 設 cron 才運轉，只用灰字說明 | 升級為「複製 cron 網址」按鈕＋三步圖文＋一鍵設定引導 |
| 中 | 草稿卡露出英文狀態值（draft/approved…）、8 顆動作鈕無主次、刪除與發布同級 | 狀態中文化；主鈕「核准並發布」突出，其餘收進「⋯更多」，刪除標紅 |
| 中 | 排程用原生 `datetime-local`（吃瀏覽器本地時區，與全站台北時區不符） | 旁標「(台北時間)」、顯示端明示時區 |
| 低 | 帳號身分/登出藏在導覽列尾端 | 移到右上角頭像下拉選單 |
| 低 | 儀表板 30s 全量輪詢、背景分頁不暫停 | `visibilitychange` 隱藏時暫停輪詢 |

---

## 五、功能差距與路線圖（C2 摘要）

**競品有、我方缺（節選高價值）：**
- 內容日曆**拖拉式**改期、**常青回收**（高：爆款商品重炒、省 token）
- **AI 生圖／商品輪播圖**（高：Threads 帶圖轉換明顯較好、蝦皮商品圖剛需）
- **趨勢/熱門商品發掘**（高：選品＝賺錢核心，台灣在地殺手鐧）
- **Link-in-bio 落地頁**（高：Threads/IG bio 是導購主入口）
- Hashtag 建議、品牌化 PDF 報表、連結點擊地理/裝置細分、多平台發佈、多分潤平台（momo/PChome）、團隊/審核、原生 App、公開 API

**排序路線圖：**
- **近期快贏（複用既有基建）**：① Link-in-bio 落地頁（用 go2read+OG）② AI 生圖/輪播圖（用自綁金鑰）③ 常青內容回收（用素材庫收益排序）④ Hashtag 建議
- **中期（賺錢決策層）**：① 熱門商品/趨勢選品助手 ② 品牌化績效 PDF ③ 多平台先做 IG/Threads 雙發 ④ 連結分析升級
- **長期（規模化）**：① 多分潤平台 ② 團隊/MCN workspace ③ 原生行動 App ④ 公開 API/Webhook

---

## 六、風控／可靠性／合規（C3 摘要）

**最該先收的 3 件：**
1. **發文冪等＋不確定即驗證（P0）**：5xx/timeout 應一律歸 `needs_verification`；發文後比對近期貼文回填 postId，避免「重發＝重複貼文＝Meta 判 bot」。
2. **cron 全環境強制鑑權（P0，一行可修）**：目前非 production 即使設了 `CRON_SECRET` 也 skip，staging 接真 DB 時任何人可觸發真實發文。改成「只要設了 secret 就驗」。
3. **蝦皮自我推薦（self-referral）防呆（P0，硬違規）**：TOS 零容忍、會扣佣＋列黑；目前完全不阻止 owner 自買，須加防呆與警示。

**其他必補（P1–P2）**：Token 主動健檢＋過期前告警；延遲留言跨分片重複認領；集中錯誤上報＋silent-failure 告警；內容相關性閘門（防掛羊頭）；多帳號 IP/身分隔離策略（至少文件化＋儀表板警示）；發文前讀額度接近上限即停；`ownerId` 非空保證（移除 `owner_id ?? ""`）；短碼 TTL＋expand 限流。

**三條合規紅線（不可回退）：**
- **AI 量產＋自動化是 2026 Threads 封號潮靶心，且連坐 IG**：須確保跨帳號文風差異化、避免共用 IP 指紋、發文前動態讀官方 `threads_publishing_limit`（勿寫死）。
- **蝦皮自我推薦零容忍**：必加自買防呆。
- **中轉導流目前合規，別越界**：揭露＋真實點擊＋內容相關性是保命三件套；任何改成自動 redirect/隱藏層/誤導按鈕/掛羊頭都踩紅線。把「無自動觸發＋相關性」寫進不可回退測試。

---

## 七、建議的「立刻可做」短清單（高槓桿低成本）

1. 統一命名（導覽＝H1＝次分頁）——純字串。
2. cron 全環境鑑權——一行。
3. 草稿狀態中文化＋動作鈕主次分層。
4. 首篇路徑：Cloudinary 改選填、純文字可先發。
5. 蝦皮自買防呆＋分潤商品相關性提示。
6. 發文不確定一律待驗證＋發後比對回填 postId。
7. Link-in-bio 落地頁（變現主入口、基建已有）。
8. 常青內容回收（爆款重炒、省 AI 成本）。

---

*來源 URL 已記錄於各代理原始輸出；主要參照：Buffer/Publer/Postiz/Metricool/SocialBee/Vista Social 官方文件與 G2、Typefully/Hypefury/Taplio、Geniuslink/Pretty Links/Bitly/Linktree、ContentStudio/FeedHive docs、Postiz/Mixpost GitHub、蝦皮聯盟約定條款與 Spam/Fraud Guidelines、Meta Threads API changelog 與 rate limits、FTC Endorsement Guides。*
