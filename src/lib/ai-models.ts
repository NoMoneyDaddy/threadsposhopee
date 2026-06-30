// 可供使用者自選的 Gemini 文案模型清單。純資料/純函式，可單測。
// 刻意「不寫死每日次數」：Google 免費層額度近期多次大幅調降、各模型差很多（實測 2.5-flash 曾僅 20 次/日），
// 寫具體數字只會誤導。改用相對級距（高/中/低），確切值一律導去官方額度頁。
export interface GeminiModelInfo {
  id: string;
  /** 簡短名（用於「平台預設」標示，不含括號說明）。 */
  short: string;
  label: string;
  /** 免費層額度相對級距：高 > 中 > 低。確切每日上限隨 Google 政策變動，以官方為準。 */
  freeTier: "高" | "中" | "低";
  note: string;
}

// 由免費額度多到少排序。涵蓋目前常見、確定多模態的 2.5 系列。
export const GEMINI_MODELS: GeminiModelInfo[] = [
  { id: "gemini-2.5-flash-lite", short: "2.5 Flash-Lite", label: "2.5 Flash-Lite（最省）", freeTier: "高", note: "多模態最便宜、速度最快，短文案夠用" },
  { id: "gemini-2.5-flash", short: "2.5 Flash", label: "2.5 Flash（品質較高）", freeTier: "中", note: "文案品質較好，但免費每日額度明顯較少、較貴" },
  { id: "gemini-2.5-pro", short: "2.5 Pro", label: "2.5 Pro（最高品質）", freeTier: "低", note: "最強但最慢，免費額度最少（近期多已轉付費）" }
];

// 免費級距排序權重（高>中>低），供 UI 與測試判斷遞減。
export const FREE_TIER_RANK: Record<GeminiModelInfo["freeTier"], number> = { 高: 3, 中: 2, 低: 1 };

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

// 是否為允許的模型 id（擋任意字串打進 Gemini API）。
export function isAllowedGeminiModel(id: unknown): id is string {
  return typeof id === "string" && GEMINI_MODELS.some((m) => m.id === id);
}

// 取模型資訊（找不到回 null）。
export function geminiModelInfo(id: string): GeminiModelInfo | null {
  return GEMINI_MODELS.find((m) => m.id === id) ?? null;
}

// 解析「設定模型」API 收到的 model 輸入（純函式可測）。回傳：
//   string  → 設成該白名單模型
//   null    → 明確清除（回到全站預設）：只有 model 為 null 或空字串才算清除
//   undefined → 非法輸入（缺欄位/型別錯誤/非白名單字串）→ 呼叫端回 400，不可誤當清除而覆寫既有設定
export function normalizeModelInput(raw: unknown): string | null | undefined {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const m = raw.trim();
  if (!m) return null; // 純空白＝清除
  return isAllowedGeminiModel(m) ? m : undefined;
}
