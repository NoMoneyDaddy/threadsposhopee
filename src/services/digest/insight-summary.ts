// 成效歸因 AI 摘要：把每日數據丟給 LLM，產出「為什麼 + 該怎麼辦」的精簡可行建議。
// 數據源都已存在（發布量/互動/收益/觸及驟降/待辦），AI 只負責歸因與行動建議。
import { geminiText } from "@/services/ai/gemini";
import type { DailyDigestInput } from "./daily";

// 純函式：把數據組成給 LLM 的提示詞（可測，不打網路）。
export function buildInsightPrompt(d: DailyDigestInput): string {
  const facts: string[] = [
    `近24h已發布：${d.publishedLast24h} 篇`,
    `佇列待發：${d.approved} 篇`
  ];
  if (d.engagementTotals) facts.push(`互動：觀看 ${d.engagementTotals.views}、讚 ${d.engagementTotals.likes}`);
  if (d.topPosts.length) facts.push(`熱門貼文：${d.topPosts.map((p) => `${p.name}(${p.views}觀看)`).join("、")}`);
  if (d.revenue) facts.push(`分潤收益：NT$${d.revenue.commission.toFixed(2)}（${d.revenue.conversions} 筆轉換）`);
  if (d.reachDrop)
    facts.push(`觸及驟降：近期中位觀看 ${d.reachDrop.recentMedian} 僅基準 ${d.reachDrop.baselineMedian} 的 ${Math.round(d.reachDrop.ratio * 100)}%`);
  const issues: string[] = [];
  if (d.draftsFailed) issues.push(`發布失敗 ${d.draftsFailed}`);
  if (d.replyFailed) issues.push(`留言補發失敗 ${d.replyFailed}`);
  if (d.invalidMaterials) issues.push(`失效素材 ${d.invalidMaterials}`);
  if (d.tokenExpiring) issues.push(`token即將到期 ${d.tokenExpiring}`);
  if (issues.length) facts.push(`待辦：${issues.join("、")}`);

  return [
    "你是蝦皮分潤 × Threads 自動發文的營運顧問。根據以下今日數據，用繁體中文給出「精簡、可立即執行」的歸因與建議。",
    "規則：最多 3 點、每點一句話、聚焦最重要的問題與下一步行動；不要客套、不要重複數據本身、不要 markdown 標題。",
    "",
    "今日數據：",
    ...facts.map((f) => `- ${f}`)
  ].join("\n");
}

// 產生 AI 分析文字；失敗回 null（呼叫端略過、不擋摘要發送）。
export async function summarizeInsights(d: DailyDigestInput, apiKey?: string | null): Promise<string | null> {
  try {
    const text = await geminiText(buildInsightPrompt(d), apiKey, 0.4, 400);
    return text || null;
  } catch {
    return null;
  }
}
