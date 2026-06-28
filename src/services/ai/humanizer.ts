// 去 AI 腔／去 slop 的中文文案系統規則。
// 參考並融合：
//   - blader/humanizer（讓 AI 文字讀起來像真人：有觀點、節奏、具體細節、容許不完美）
//   - hardikpandya/stop-slop（移除 LLM「slop」：套話、過度修飾、空洞轉折、清單腔）
//   - kevintsai1202/Humanizer-zh-TW（繁中專屬 AI 腔：避免「是」改文謅謅、分詞式空泛分析、模板段落）
//   - Wikipedia: Signs of AI writing（拔高意義、模糊歸因、對仗/三段式、破折號/粗體/標題等格式 tell）
import { DEFAULT_COPY_PREFS, describeMain, describeReply, type CopyPrefs } from "./prefs";

// 通用「去 AI 腔」核心規則（不綁定特定情境）：文案與 AI 部落客流程共用，確保兩邊一致。
export const ANTI_AI_SLOP_RULES = `寫得要像真人隨手打的貼文，不能有 AI 腔、不能像新聞稿或業配。

【像真人（必做）】
- 有觀點與真實反應（驚到、後悔、回購、踩雷），講具體細節（用了多久、什麼情境、誰說了什麼），不要抽象形容詞堆疊。
- 長短句交錯、口語節奏，可以有不完整的句子；允許一點不完美，太工整反而假。
- 第一人稱，直接用「是／有／會」這種白話動詞，不要為了文謅謅改成「作為／扮演著／標誌著／堪稱」。

【嚴禁 AI 腔／slop】
- 套話與空洞轉折：此外、值得一提的是、值得注意的是、總而言之、綜上所述、總的來說、說到這個、不得不說、眾所周知、在這個…的時代、讓我們、展望未來。
- 行銷詞：CP值爆表、必買、神器、無痛、輕鬆擁有、質感滿分、絕對、一定後悔、賦能、打造、提升、不可或缺。
- 對仗／升華句型：「不只…更…」「不是…而是…」「與其說…不如說…」，以及三段式排比。
- 分詞式空泛分析尾巴：「…，凸顯了…」「…，反映出…」「…，象徵著…」「…，為…奠定基礎」。
- 拔高意義：具有重要意義、影響深遠、里程碑、寫下新篇章、扮演著重要角色。
- 模板段落：「儘管面臨挑戰，但…」這類起承轉合套版。
- 模糊歸因：據說、有人說、業界報導、專家指出、研究顯示、觀察人士認為（沒實際來源就別寫）。
- 格式：禁止破折號（—）濫用、粗體、條列符號、標題、emoji 當標題、彎引號；不要同義詞硬湊字數、不要過度 hedging（「可能」「也許」連發）。`;

export const HUMANIZER_RULES = `你是經營 Threads 的真人創作者，不是行銷小編。寫蝦皮好物分享要像跟朋友聊天，不能有業配味、不能像 AI 寫的。

${ANTI_AI_SLOP_RULES}
- 另外：不要客套開場與正能量結尾（如「希望對你有幫助」「快來試試吧」）。
- 整則貼文（正文與留言）不要使用任何 emoji 或表情符號（包含連結圖示、表情臉等），用文字表達情緒即可。`;

export interface CopyContext {
  productName: string;
  shopeeShortLink: string;
  sourceText?: string; // 來源貼文原文（給 AI 當靈感，但不可照抄）
}

// 留言開場句池：帶出分潤連結的引導句。每篇輪換，避免每則都同一句「怕你找不到，連結放這」
// 而顯得洗版／被判機器人。一律無 emoji、口語、不誇張。
const REPLY_LEAD_INS = [
  "連結放這，需要的自己拿",
  "想看的話連結放下面",
  "連結附上，有興趣再點",
  "怕有人問，連結先放著",
  "連結在這，不用特地找",
  "放個連結，慢慢逛",
  "連結補上，方便大家",
  "順手把連結放這"
];

// 依商品連結做穩定雜湊選一句開場：同一商品穩定（重排同一篇不亂跳）、不同商品分散開來。
// 純函式、可單測；無外部隨機源（符合工作流可重現的要求）。
export function pickReplyLeadIn(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return REPLY_LEAD_INS[h % REPLY_LEAD_INS.length];
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
務必完整輸出「正文：…」與「留言區：…」兩段，缺一不可。整則不要使用任何 emoji。
正文：[${describeMain(prefs.main)}，自然有觀點]
留言區：${pickReplyLeadIn(ctx.shopeeShortLink)} ${ctx.shopeeShortLink}
[換行後再補一句你的真實反應或問句，${describeReply(prefs.reply)}；連結網址務必原樣保留、不要改動]`;
}

// 管理員「預覽 prompt」用的範例情境：用固定範例商品＋使用者偏好組出實際送進模型的 prompt。
// 抽成純函式方便單測（鎖定預覽輸出含去 AI 腔規則與範例商品），設定頁只負責 owner-only 渲染。
const PREVIEW_CTX: CopyContext = {
  productName: "（範例）無線藍牙耳機",
  shopeeShortLink: "https://go2read.link/r/example",
  sourceText: "（範例）原貼文：這支續航很久、戴起來不夾耳"
};
export function buildCopyPromptPreview(prefs: CopyPrefs = DEFAULT_COPY_PREFS): string {
  return buildCopyPrompt(PREVIEW_CTX, prefs);
}

// 把 AI 輸出拆成正文 / 留言（對應 n8n「🎬準備媒體資料」的 split 邏輯）
export function splitCopy(raw: string): { mainText: string; replyText: string } {
  // 容忍 LLM 常見輸出差異：全形/半形冒號（：/:）皆可（後綴空格由 trim 處理）。
  // 否則一旦模型輸出半形冒號就失配，分潤連結（留言區）會遺失或被併入正文。
  const parts = raw.split(/留言區[：:]/);
  const mainText = (parts[0] ?? "").replace(/^正文[：:]/, "").trim();
  const replyText = (parts[1] ?? "有問題歡迎私訊！").trim();
  return { mainText, replyText };
}
