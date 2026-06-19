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

DB 遷移目前到 `supabase/migrations/0017_reply_delay.sql`。

## 守則（見 CLAUDE.md，務必遵守）

- 每個任務開 `claude/<topic>` 分支，**不直推 main**。
- 動工前後跑綠：`npx tsc --noEmit`、`node --import tsx --test $(find src -name '*.test.ts')`、`npm run build`。
- 流程：draft PR → mark ready → 等 GitHub Actions `build` 綠 → 採納 CodeRabbit/Qodo/Gemini 合理建議（誤報用具體理由駁回）→ squash merge → 刪本地分支。
- commit 結尾加 `Co-Authored-By` 與 `Claude-Session` trailer（照既有 commit）。
- **多租戶鐵則**：所有使用者資料函式吃 `ownerId` 並過濾；`getThreadsCredentials(id, ownerId)` 必帶 owner 過濾；建草稿/發文前先 `userOwnsThreadsAccount`。
- 安全：金鑰永不入庫（env 或 AES-256-GCM）；外部 fetch 走 `fetchWithTimeout`、URL 先過 `assertSafePublicUrl`（SSRF）；時區一律 `Asia/Taipei`。
- 風格：caveman 聊天（2–4 字、繁中思考）；ponytail 編碼（YAGNI、最短 diff，但不簡化輸入驗證/錯誤處理/安全/無障礙）。

## 待人工處理（環境限制）

遠端有約 50 條已併的 `claude/*` 分支待清。受管環境的 git proxy 禁止刪 ref、也無刪分支 MCP 工具，AI 無法從 session 內刪遠端分支。請在 repo **Settings → 開「Automatically delete head branches」**，既有的用 GitHub UI 或本機 `git push origin --delete <branch>...` 清掉。（本地分支已只剩 main。）

## 候選工作（自行評估優先序，先確認 YAGNI）

- 延遲留言狀態在儀表板/草稿頁可視化（pending/failed 提示與重試）。
- 本地檔案 client-side 直傳到使用者自綁 Cloudinary（unsigned，免經我方伺服器）。
- 成效面板：接 Shopee 報表 / Threads insights。
- 素材分潤連結到期自動偵測重產。
- 影片走 Gemini Files API（大檔）。
