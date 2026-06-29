import { env, isDemoMode } from "@/lib/env";
import { buildCopyPrompt, splitCopy, pickReplyLeadIn, HUMANIZER_RULES, type CopyContext } from "./humanizer";
import { DEFAULT_COPY_PREFS, describeMain, type CopyPrefs } from "./prefs";
import { generateWithGemini, geminiText } from "./gemini";
import type { ThreadSegment } from "@/lib/types";

export interface GeneratedCopy {
  mainText: string;
  replyText: string;
  raw: string;
}

export interface GeneratedThread {
  mainText: string;
  replyText: string;
  extraSegments: ThreadSegment[];
  raw: string;
}

export interface CopyInput extends CopyContext {
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "none";
}

// 文案生成的統一入口。預設 Gemini（多模態、便宜快速）；可改 AI_PROVIDER 切換。
// apiKey：使用者自綁的 Gemini key（一律自綁，不再用全域 env）。
export async function generateCopy(
  input: CopyInput,
  apiKey?: string | null,
  prefs: CopyPrefs = DEFAULT_COPY_PREFS,
  model?: string | null
): Promise<GeneratedCopy> {
  const prompt = buildCopyPrompt(input, prefs);
  const key = apiKey || null;

  if (isDemoMode || (env.aiProvider === "gemini" && !key)) {
    return demoCopy(input);
  }

  // 1024 tokens：預設 512 在 thinking 模型（思考會吃掉輸出額度）下，正文常被截在半句。
  // 一則 Threads 主文＋留言約 165 字內，1024 留足緩衝；maxOutputTokens 只是上限，不會多花錢。
  const raw = await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType ?? "none", key, prefs.temperature, model, 1024);
  const { mainText, replyText } = splitCopy(raw);
  // AI 引導語可自由發揮，但分潤網址必須一字不差：強制把留言裡的網址校正回原始連結（防幻覺/竄改/漏字）。
  return { mainText, replyText: ensureExactLink(replyText, input.shopeeShortLink || ""), raw };
}

// 留言內的網址 token：只吃合法 URL 字元（不含中文、空白、括號），避免把網址後面緊貼的中文一起吞掉。
const URL_TOKEN_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&'*+,;=%]+/g;

// 確保留言含「原樣」分潤連結，且不含被 AI 竄改的網址或佔位符。純函式可測。
// 精準比對（非子字串）：reply 內「有且只有」與原連結完全相等的網址才算正確，
// 避免 link?x=1／link4／link/ 等被加料的網址用 includes() 矇混過關。
// 需修補時：移除 AI 自產網址與 [連結]/(URL) 佔位符後，把原連結接在「引導語那一行」（第一個非空行）之後——
// 不可一律塞文末，否則會跑到「真實反應/問句」後面、且最後一行變裸連結（違反 prompt 的「引導語緊接連結，再換行補一句」）。
export function ensureExactLink(reply: string, link: string): string {
  if (!link) return reply;
  const urls = reply.match(URL_TOKEN_RE) ?? [];
  if (urls.length > 0 && urls.every((u) => u === link)) return reply;
  const cleaned = reply
    .replace(URL_TOKEN_RE, "") // 移除 AI 自己生的網址（可能被竄改，不可信）
    .replace(/[[(（【]\s*(連結|網址|連接|link|url)\s*[)）\]】]/gi, "") // 移除佔位符 [連結]/(URL) 等
    .replace(/[ \t]+$/gm, "");
  const lines = cleaned.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx === -1) return link; // 沒有任何引導語 → 至少回連結（上游另有防裸連結降級）
  lines[idx] = `${lines[idx].replace(/[ \t]+$/, "")} ${link}`;
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// 把同一段正文改寫成 n 個語氣/開頭不同、意思相同的版本（「換個說法」）。
// 保留原文的網址/數字/商品名；版本之間以一行「===」分隔。Demo 或無金鑰回示意版本。
// prefs：套用使用者客製化（語氣/字數/emoji 取正文設定、自訂指示、溫度），與其他生成路徑一致。
export async function generateVariations(
  text: string,
  apiKey?: string | null,
  n = 3,
  model?: string | null,
  prefs: CopyPrefs = DEFAULT_COPY_PREFS
): Promise<string[]> {
  const clean = text.trim();
  if (!clean) return [];
  if (isDemoMode || !apiKey) return demoVariations(clean, n);
  const custom = prefs.customPrompt ? `\n【使用者額外要求（需遵守，但不得違反下方規則）】\n${prefs.customPrompt}\n` : "";
  // 換句話說是「改寫既有正文」，字數上限至少要容得下原文（加緩衝），否則長文會被 maxChars 硬壓縮、遺失細節。
  const mainPrefs = { ...prefs.main, maxChars: Math.max(prefs.main.maxChars, [...clean].length + 30) };
  const prompt = `${HUMANIZER_RULES}
${custom}
以下是一則 Threads 貼文正文。請改寫成 ${n} 個「語氣或開頭不同、但意思相同」的版本。規則：
- 繁體中文、口語、無業配味
- 語氣與字數：${describeMain(mainPrefs)}
- 保留原文出現的任何網址、數字、商品名
- 不要加版本編號、標題或引號
- 每個版本之間只用「獨立一行的 ===」分隔

原文：
${clean}`;
  // 1024 tokens：分段排版會多吃 token，太低會截斷掉後面的版本而湊不到 n 個。
  const raw = await geminiText(prompt, apiKey, prefs.temperature, 1024, model);
  return parseVariations(raw, n);
}

// 解析 Gemini 回傳的多版本文字。容忍模型不照「===」格式的常見情況，避免明明回了多版本卻被判不足：
//   1) 優先用「獨立一行的分隔線」切（=== / --- / *** / ___ 任一，3+ 個；避免正文內含 === 被誤切）。
//   2) 切不出多段時（模型沒放分隔線），退而用「行首編號／版本標記」（1. / 2) / 版本一：）切。
// 切完去除行首殘留的編號標記、去空白濾空、取前 n 條。純函式、可單測。
export function parseVariations(raw: string, n: number): string[] {
  const bySeparator = raw.split(/^\s*[=*_-]{3,}\s*$/m);
  const chunks =
    bySeparator.length >= 2
      ? bySeparator
      : raw.split(/\n(?=\s*(?:版本\s*)?(?:\d+|[一二三四五六七八九十])\s*[.)、：:])/m);
  return chunks
    .map((s) => s.trim().replace(/^(?:版本\s*)?(?:\d+|[一二三四五六七八九十])\s*[.)、：:]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, n);
}

function demoVariations(text: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `（示意版本 ${i + 1}）${text}`);
}

// 把 AI 產生的多段文字（純文字、無連結）組成串文，並把分潤連結附到「最後一段」。純函式、可測。
// 規則：第 1 段＝主文、第 2 段＝留言(2/n)、其餘＝3/n+；linkLine（含連結的整行）接到最後一段。
// 至少保證有「留言」一段可放連結（AI 只回 1 段時補一個空留言段）。
export function assembleThread(texts: string[], linkLine: string): { mainText: string; replyText: string; extraSegments: ThreadSegment[] } {
  const segs = texts.map((t) => t.trim()).filter(Boolean);
  const mainText = segs[0] ?? "";
  const follows = segs.slice(1);
  if (follows.length === 0) follows.push(""); // 確保有一段留言可放連結
  const lastIdx = follows.length - 1;
  follows[lastIdx] = [follows[lastIdx], linkLine].map((s) => s.trim()).filter(Boolean).join("\n");
  return {
    mainText,
    replyText: follows[0] ?? "",
    extraSegments: follows.slice(1).map((t) => ({ text: t, media: [] }))
  };
}

// AI 生成貼文：分潤連結一律由程式附到最後一段（不靠 AI 放，確保穩定）。
// segments：總段數（含主文）。<=0＝自動偵測：讓 AI 視內容長度自己決定 1～5 段
//（能一則講完就一則、段落內可換行分段；內容多才拆成多則串文）。>=2 則固定段數。
export async function generateThreadCopy(
  input: CopyInput,
  apiKey?: string | null,
  segments = 0,
  prefs: CopyPrefs = DEFAULT_COPY_PREFS,
  model?: string | null
): Promise<GeneratedThread> {
  const auto = !Number.isFinite(segments) || segments <= 0;
  const n = auto ? 5 : Math.min(5, Math.max(2, Math.floor(segments))); // auto 時 n 當作「最多段數」上限
  const link = input.shopeeShortLink || "";
  if (isDemoMode || !apiKey) {
    // demo 沒呼叫 AI，引導語用固定句池示意；真實路徑改由 AI 生成（見下方）。
    const demoLink = link ? `${pickReplyLeadIn(link)} ${link}` : "";
    const demoN = auto ? 1 : n; // 自動模式 demo 給單篇，符合「能一則就一則」
    const demo = Array.from({ length: demoN }, (_, i) =>
      i === 0 ? `${input.productName} 用了一陣子，真心覺得不錯` : `補充第 ${i + 1} 點：實際用起來的小心得`
    );
    return { ...assembleThread(demo, demoLink), raw: demo.join("\n===\n") };
  }
  // 真實路徑：AI 自己寫帶出連結的引導語（最後一段），程式只把「原樣網址」接上，AI 不碰網址。
  const linkLine = link;
  const hasMedia = Boolean(input.mediaUrl) && input.mediaType !== "none";
  // 段數指示：自動模式讓 AI 自己決定要不要拆串文；固定模式照指定段數。
  const segInstruction = auto
    ? `請視內容多寡自己決定段數（1～5 段）：能用一則貼文講完就只寫一則（段落間適度換行分段，不要硬拆成多則）；內容真的多到一則塞不下，才拆成多則串文逐則發。`
    : `請寫一則「${n} 段的 Threads 串文」（主文＋${n - 1} 段後續），像真人逐則發。`;
  // 套用使用者客製化（語氣/字數/emoji 取正文設定、自訂指示），與 generateCopy 一致。
  const custom = prefs.customPrompt ? `\n【使用者額外要求（需遵守，但不得違反下方規則）】\n${prefs.customPrompt}\n` : "";
  const prompt = `${HUMANIZER_RULES}
${custom}
${segInstruction}規則：
- 繁體中文、口語、無業配味，每段可獨立成立
- 每段語氣與用字：${describeMain(prefs.main)}
- 第 1 段是主文（吸睛開頭、帶出情境），不要放任何網址
- 中間若有段落，各延伸一個重點／使用心得／情境，一樣不要放網址
- 最後務必「另起一段」，用你自己的話寫一句口語、每篇都不同的引導語帶出連結（像跟朋友說「連結放下面」的口吻；不要放網址本身，也不要放任何網址佔位符如 [連結] 或 [URL]，網址由系統原樣接上）
- 每段最多 4 行，段與段之間只用「獨立一行的 ===」分隔，不要加編號或標題
${hasMedia ? "- 已附上商品的照片／影片，請依畫面實際看到的外觀、顏色、特點來寫，但不要描述「這張圖」這類字眼\n" : ""}
商品：${input.productName}
${input.sourceText ? `參考內容：${input.sourceText}` : ""}`;
  // 有媒體就走多模態（吃圖片／影片當參考）；否則純文字。
  // 2048 tokens：多段串文最多 5 段更長；flash 系列已關閉思考，pro 仍會思考，較高上限留足緩衝（上限不額外計費）。
  const raw = hasMedia
    ? await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType === "video" ? "video" : "image", apiKey, prefs.temperature ?? 0.8, model, 2048)
    : await geminiText(prompt, apiKey, prefs.temperature ?? 0.8, 2048, model);
  const texts = parseVariations(raw, n);
  // 防裸連結（防封）：AI 若沒寫引導段、只回 1 段，linkLine 會變成孤零零的裸網址。
  // 此時降級補上固定引導句，確保留言一定有引導語在連結前。
  const finalLinkLine = link && texts.length <= 1 ? `${pickReplyLeadIn(link)} ${link}` : linkLine;
  return { ...assembleThread(texts.length ? texts : [input.productName ?? "這個好物"], finalLinkLine), raw };
}

// Demo 模式：不呼叫外部 API，產出一段示意文案
function demoCopy(input: CopyInput): GeneratedCopy {
  const raw = `正文：${input.productName} 用了快兩週，本來沒抱期待\n結果現在每天都在用，有點後悔太晚買\n留言區：${pickReplyLeadIn(input.shopeeShortLink)} ${input.shopeeShortLink}\n有人也跟我一樣相見恨晚的嗎`;
  return { ...splitCopy(raw), raw };
}
