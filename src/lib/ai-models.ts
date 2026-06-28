// 可供使用者自選的 Gemini 文案模型清單＋免費層額度概估。純資料/純函式，可單測。
// 免費層每日請求上限（freeRpd）會隨 Google 政策變動，這裡為「概估」，UI 一律標示「以官方為準」並附連結。
export interface GeminiModelInfo {
  id: string;
  label: string;
  /** 免費層每日請求上限（RPD）概估；實際以 Google AI Studio 為準。 */
  freeRpd: number;
  note: string;
}

// 由便宜到貴排序。涵蓋目前常見、確定多模態的 2.5 系列。
export const GEMINI_MODELS: GeminiModelInfo[] = [
  { id: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite（最省，預設）", freeRpd: 1000, note: "多模態最便宜、速度最快，短文案夠用" },
  { id: "gemini-2.5-flash", label: "2.5 Flash（品質較高）", freeRpd: 250, note: "文案品質較好，較貴、免費額度較少" },
  { id: "gemini-2.5-pro", label: "2.5 Pro（最高品質）", freeRpd: 100, note: "最強但最慢、免費額度最少" }
];

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

// 是否為允許的模型 id（擋任意字串打進 Gemini API）。
export function isAllowedGeminiModel(id: unknown): id is string {
  return typeof id === "string" && GEMINI_MODELS.some((m) => m.id === id);
}

// 取模型資訊（找不到回 null）。
export function geminiModelInfo(id: string): GeminiModelInfo | null {
  return GEMINI_MODELS.find((m) => m.id === id) ?? null;
}

// 免費層每日「約可生成幾篇」：每篇文案約 1 次 AI 呼叫，故 ≈ freeRpd。純函式（之後若每篇多次呼叫可改係數）。
export function estimatedPostsPerDay(freeRpd: number, callsPerPost = 1): number {
  if (!Number.isFinite(freeRpd) || freeRpd <= 0 || callsPerPost <= 0) return 0;
  return Math.floor(freeRpd / callsPerPost);
}
