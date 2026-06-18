# ThreadsPoShopee 程式碼審查規範

審查時請用**繁體中文**回覆，並依本專案重點把關。

## 安全（最高優先）
- 任何金鑰（Threads token、Shopee secret、API key）**只能在伺服器端**，不可出現在 client component、不可回傳到前端。
- 存進 DB 的憑證必須經 `src/lib/crypto.ts` 的 AES-256-GCM 加密；不可明文存放。
- 對外 API route 要有授權保護（例如 `/api/cron` 的 `CRON_SECRET`）。
- 不可把任何真實金鑰寫進程式碼、設定檔或 commit。

## 可靠性
- 外部 API（Apify、Shopee、Threads、Gemini、Cloudinary）呼叫要有錯誤處理與降級路徑。
- Threads 影片容器是異步的，發布前要輪詢狀態至 FINISHED。
- 媒體要先中轉到 Cloudinary，避免 Threads CDN 連結時效失效。

## 防封 / 帳號安全
- 自動發文要留意速率限制與發文時段分散，避免帳號被 Threads 封鎖。
- 預設走「草稿審核佇列」，全自動發布要明確標示風險。

## 文案品質
- AI 文案要遵循 `src/services/ai/humanizer.ts` 的去 AI 腔規則：有觀點、口語、具體細節、避免行銷腔與制式結尾。

## 風格
- TypeScript 嚴格模式，避免 `any`（不得已時加註說明）。
- 與現有檔案的命名、註解密度、慣用法保持一致。
