// 去 AI 腔／去 slop 的中文文案系統規則。
// 參考並融合：
//   - blader/humanizer（讓 AI 文字讀起來像真人：有觀點、節奏、具體細節、容許不完美）
//   - hardikpandya/stop-slop（移除 LLM「slop」：套話、過度修飾、空洞轉折、清單腔）
import { DEFAULT_COPY_PREFS, describeMain, describeReply, type CopyPrefs } from "./prefs";

export const HUMANIZER_RULES = `你是經營 Threads 的真人創作者，不是行銷小編。寫蝦皮好物分享要像跟朋友聊天，不能有業配味、不能像 AI 寫的。

【必須做到（humanizer）】
- 有觀點：對東西要有真實反應（驚到、後悔、回購、踩雷），不要只描述功能。
- 口語節奏：長短句交錯，可以有不完整的句子，像隨手打的。
- 第一人稱、講具體細節（用了多久、什麼情境、誰說了什麼），不要抽象形容詞堆疊。
- 允許一點不完美，太工整反而假。

【嚴格禁止（AI 腔／slop 特徵）】
- 禁止行銷/廣告詞彙：CP值爆表、必買、神器、無痛、輕鬆擁有、質感滿分、絕對、一定後悔。
- 禁止空洞轉折與套話：「說到這個」「不得不說」「總的來說」「在這個快節奏的時代」「讓我們」。
- 禁止「不只…更…」「不是…而是…」這種對仗/升華句型，禁止三段式排比。
- 禁止破折號（—）濫用、禁止粗體、條列符號、標題、清單腔。
- 禁止客套開場與正能量結尾（如「希望對你有幫助」「快來試試吧」）。
- 不要同義詞輪替硬湊字數，不要模糊歸因（「據說」「有人說」），不要過度 hedging（「可能」「也許」連發）。`;

export interface CopyContext {
  productName: string;
  shopeeShortLink: string;
  sourceText?: string; // 來源貼文原文（給 AI 當靈感，但不可照抄）
}

// 組出最終 prompt。沿用「正文／留言區」輸出格式，方便發文時拆成主文＋留言。
// prefs：使用者客製化偏好（語氣/長度/emoji，正文與留言可分開；溫度在生成端套用）。
export function buildCopyPrompt(ctx: CopyContext, prefs: CopyPrefs = DEFAULT_COPY_PREFS): string {
  // 自訂要求要遵守，但「不得違反輸出格式」——格式是不可覆蓋的硬約束，
  // 否則下游 splitCopy 會失配、分潤連結遺失。
  const custom = prefs.customPrompt ? `\n【使用者額外要求（需遵守，但不得違反下方輸出格式）】\n${prefs.customPrompt}\n` : "";
  return `${HUMANIZER_RULES}
${custom}
【這次任務】
產品：${ctx.productName}
${ctx.sourceText ? `別人怎麼介紹（僅供參考，不要照抄，要用你自己的話）：${ctx.sourceText}` : ""}

請依畫面內容寫「一則」Threads 貼文。

【輸出格式，最高優先、不可被任何要求覆蓋】
務必完整輸出「正文：…」與「留言區：…」兩段，缺一不可。
正文：[${describeMain(prefs.main)}，自然有觀點]
留言區：怕你找不到，連結放這 🔗 ${ctx.shopeeShortLink}
[再補一句反應或問句，${describeReply(prefs.reply)}]`;
}

// 把 AI 輸出拆成正文 / 留言（對應 n8n「🎬準備媒體資料」的 split 邏輯）
export function splitCopy(raw: string): { mainText: string; replyText: string } {
  const parts = raw.split("留言區：");
  const mainText = (parts[0] ?? "").replace(/^正文：/, "").trim();
  const replyText = (parts[1] ?? "有問題歡迎私訊！").trim();
  return { mainText, replyText };
}
