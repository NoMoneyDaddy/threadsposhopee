// AI 內容合規預檢：升級既有硬規則（500 字 / 1 hashtag）為 LLM 語意級判斷——
// 這篇文案像不像「廣告農場/過度推銷」而易被 Threads 降觸及/封號。on-demand 呼叫，使用者自付。
import { geminiText } from "@/services/ai/gemini";

export const MAX_COMPLIANCE_CHARS = 1000;

// 純函式：組合規檢查提示詞（可測，不打網路）。
export function buildCompliancePrompt(text: string): string {
  return [
    "你是 Threads 防封與觸及優化顧問。判斷以下蝦皮分潤貼文「被降觸及/封號」的風險。",
    "考量：是否過度推銷、像廣告農場、堆砌 hashtag/emoji、誇大不實、重複洗版感、夾帶可疑連結語氣。",
    "用繁體中文回覆，格式固定為兩行：",
    "風險：低/中/高",
    "建議：一句話可立即執行的修改（若風險低就寫「可直接發布」）。",
    "",
    "貼文：",
    text.slice(0, MAX_COMPLIANCE_CHARS)
  ].join("\n");
}

export interface ComplianceResult {
  risk: "低" | "中" | "高" | "未知";
  advice: string;
  raw: string;
}

// 解析 LLM 回覆（純函式可測）：抓「風險：X」「建議：Y」。
export function parseCompliance(raw: string): ComplianceResult {
  const riskMatch = raw.match(/風險[:：]\s*([低中高])/);
  const adviceMatch = raw.match(/建議[:：]\s*(.+)/);
  const risk = (riskMatch?.[1] as ComplianceResult["risk"]) ?? "未知";
  const advice = adviceMatch?.[1]?.trim() || raw.trim().slice(0, 200);
  return { risk, advice, raw: raw.trim() };
}

// 跑一次合規檢查；失敗會拋錯，由呼叫端轉成友善訊息。
export async function checkCompliance(text: string, apiKey?: string | null): Promise<ComplianceResult> {
  const out = await geminiText(buildCompliancePrompt(text), apiKey, 0.2, 200);
  return parseCompliance(out);
}
