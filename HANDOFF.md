# HANDOFF — 接續執行指南

給下一個 session（AI 協作者）的接力說明。動手前先讀本檔 + `CLAUDE.md` + `README.md`，並跑 `git log --oneline -15` 對齊現況。

延續**自主開發模式**：持續找新角度、自己開 feature 分支實作；只有真有歧義或架構級決策才用 AskUserQuestion 問使用者。

## 現況

專案：**nomoneydaddy/threadsposhopee**（Next.js 14 App Router + Supabase）——自動把 Shopee 分潤文案發到 Threads 的多帳號排程控制台。

近期已併入 main：

| PR | 功能 |
|----|------|
| #50 | 發布節奏隨機抖動 + 發文進度/ETA |
| #51 | 一鍵「立即跑一輪佇列」 + 分布式鎖 |
| #52 | 各人自綁 Cloudinary（素材進自己雲端） |
| #53 | 自寫一則直推（free-form 發文）+ 跨租戶發文越權修補 |
| #54 | 發文預覽對齊 Threads 串文（主文 1/2 + 接續 2/2） |
| #56 | 延遲留言（保底 + 隨機抖動 + 逐則覆寫 + 原子認領補發） |
| #57 | 發文佇列帳號分片並行（`?shards=N&shard=i`） |
| #55 / #58 | 文檔同步至 migrations 0017 |
| #60 | 成效/防封/常青回收/最佳時段/影片 Files API/每日摘要 組合 + Playwright E2E（入 CI） |
| #61 | 佇列草稿可改排程時間（手動微調發布時段） |
| #62 | 全域發文急停開關（owner 一鍵暫停/恢復自動發文） |
| #63 | 觸及驟降預警（疑似 shadowban／降觸及偵測，成效頁 + 每日摘要推播） |
| #64 | 帳號連續失敗斷路器（單輪失敗達上限自動暫停該帳號＋示警） |

DB 遷移目前到 `supabase/migrations/0017_reply_delay.sql`（#60–#64 皆用 `app_state` 或單輪記憶體邏輯，未新增遷移）。

## 守則（見 CLAUDE.md，務必遵守）

- **流程**：本遠端／web session 在指派的 `claude/*` 分支開發 → 推上去 → 開 **draft PR** → CI（build + e2e + GitGuardian）綠 → **squash 合併** → 同步本機 `main`，再挖下一個。（CLAUDE.md 的「直接在 main」是本機情境；遠端走分支＋PR，因環境要求。）
- **本機綠燈是合併前提**：每次提交前 `npx tsc --noEmit`、`node --import tsx --test $(find src -name '*.test.ts')`、`npm run build` 都要綠，務必嚴格。E2E（`npx playwright test --project=chromium`）動到頁面時跑一次。
- **review bot**：CodeRabbit（草稿自動跳過）、Gemini、Qodo 會留言。Gemini 的具體修正建議通常合理且小（如輸入驗證、fail-safe、門檻防虛警）→ 評估後採納再合併；摘要類無需動作。
- 重推同分支因遠端留有 PR 前一版 commit 而 non-fast-forward 時，用 `git push --force-with-lease=<branch>:origin/<branch>`。
- commit 結尾加 `Co-Authored-By` 與 `Claude-Session` trailer（照既有 commit）。
- **多租戶鐵則**：所有使用者資料函式吃 `ownerId` 並過濾；`getThreadsCredentials(id, ownerId)` 必帶 owner 過濾；建草稿/發文前先 `userOwnsThreadsAccount`。
- 安全：金鑰永不入庫（env 或 AES-256-GCM）；外部 fetch 走 `fetchWithTimeout`、URL 先過 `assertSafePublicUrl`（SSRF）；時區一律 `Asia/Taipei`。
- 風格：caveman 聊天（2–4 字、繁中思考）；ponytail 編碼（YAGNI、最短 diff，但不簡化輸入驗證/錯誤處理/安全/無障礙）。

## 待人工處理（環境限制）

遠端有約 50 條已併的 `claude/*` 分支待清。受管環境的 git proxy 禁止刪 ref、也無刪分支 MCP 工具，AI 無法從 session 內刪遠端分支。請在 repo **Settings → 開「Automatically delete head branches」**，既有的用 GitHub UI 或本機 `git push origin --delete <branch>...` 清掉。（本地分支已只剩 main。）

## 候選工作（自行評估優先序，先確認 YAGNI）

已完成：延遲留言可視化、成效面板（Shopee 報表＋Threads insights）、連結到期重產、影片 Files API、急停開關、觸及驟降預警、失敗斷路器。

待挖：
- 觸及驟降／斷路器**每帳號**化（目前驟降偵測為跨帳號綜合；可逐帳號算 baseline 更精準）。
- 自動防護閉環：偵測觸及驟降時，選配自動觸發急停 N 小時（需 pause 加 expiry 狀態）。
- 本地檔案 client-side 直傳自綁 Cloudinary（unsigned，免經我方伺服器）。
- 草稿審核效率：鍵盤快捷／批次 AI 重寫。
- 收益歸因：subId 編碼帳號/草稿，讓分潤報表能歸因到「哪個帳號／哪篇」。
