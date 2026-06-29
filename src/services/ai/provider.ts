import { env, isDemoMode } from "@/lib/env";
import { buildCopyPrompt, splitCopy, pickReplyLeadIn, HUMANIZER_RULES, type CopyContext } from "./humanizer";
import { DEFAULT_COPY_PREFS, type CopyPrefs } from "./prefs";
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
  return { ...splitCopy(raw), raw };
}

// 把同一段正文改寫成 n 個語氣/開頭不同、意思相同的版本（「換個說法」）。
// 保留原文的網址/數字/商品名；版本之間以一行「===」分隔。Demo 或無金鑰回示意版本。
export async function generateVariations(text: string, apiKey?: string | null, n = 3, model?: string | null): Promise<string[]> {
  const clean = text.trim();
  if (!clean) return [];
  if (isDemoMode || !apiKey) return demoVariations(clean, n);
  const prompt = `${HUMANIZER_RULES}

以下是一則 Threads 貼文正文。請改寫成 ${n} 個「語氣或開頭不同、但意思相同」的版本。規則：
- 繁體中文、口語、無業配味
- 保留原文出現的任何網址、數字、商品名
- 不要加版本編號、標題或引號
- 每個版本之間只用「獨立一行的 ===」分隔

原文：
${clean}`;
  // 1024 tokens：分段排版會多吃 token，太低會截斷掉後面的版本而湊不到 n 個。
  const raw = await geminiText(prompt, apiKey, 0.9, 1024, model);
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

// AI 生成「多段串文」：主文＋數段後續，分潤連結一律由程式附到最後一段（不靠 AI 放，確保穩定）。
// segments＝總段數（含主文），夾 2–5。回傳直接對應編輯器的 PostContent 文字欄位。
export async function generateThreadCopy(
  input: CopyInput,
  apiKey?: string | null,
  segments = 3,
  prefs: CopyPrefs = DEFAULT_COPY_PREFS,
  model?: string | null
): Promise<GeneratedThread> {
  const n = Math.min(5, Math.max(2, Math.floor(segments) || 3));
  const link = input.shopeeShortLink || "";
  const linkLine = link ? `${pickReplyLeadIn(link)} ${link}` : "";
  if (isDemoMode || !apiKey) {
    const demo = Array.from({ length: n }, (_, i) =>
      i === 0 ? `${input.productName} 用了一陣子，真心覺得不錯` : `補充第 ${i + 1} 點：實際用起來的小心得`
    );
    return { ...assembleThread(demo, linkLine), raw: demo.join("\n===\n") };
  }
  const hasMedia = Boolean(input.mediaUrl) && input.mediaType !== "none";
  const prompt = `${HUMANIZER_RULES}

請為以下蝦皮好物寫一則「${n} 段的 Threads 串文」（主文＋${n - 1} 段後續），像真人逐則發。規則：
- 繁體中文、口語、無業配味，每段可獨立成立
- 第 1 段是主文（吸睛開頭、帶出情境），不要放任何網址
- 後續每段延伸一個重點／使用心得／情境，也不要放網址（連結由系統自動補在最後一段）
- 每段最多 4 行，段與段之間只用「獨立一行的 ===」分隔，不要加編號或標題
${hasMedia ? "- 已附上商品的照片／影片，請依畫面實際看到的外觀、顏色、特點來寫，但不要描述「這張圖」這類字眼\n" : ""}
商品：${input.productName}
${input.sourceText ? `參考內容：${input.sourceText}` : ""}`;
  // 有媒體就走多模態（吃圖片／影片當參考）；否則純文字。
  // 1024 tokens：多段串文更長，且 thinking 模型會吃掉輸出額度，太低會把後段截斷。
  const raw = hasMedia
    ? await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType === "video" ? "video" : "image", apiKey, prefs.temperature ?? 0.8, model, 1024)
    : await geminiText(prompt, apiKey, prefs.temperature ?? 0.8, 1024, model);
  const texts = parseVariations(raw, n);
  return { ...assembleThread(texts.length ? texts : [input.productName ?? "這個好物"], linkLine), raw };
}

// Demo 模式：不呼叫外部 API，產出一段示意文案
function demoCopy(input: CopyInput): GeneratedCopy {
  const raw = `正文：${input.productName} 用了快兩週，本來沒抱期待\n結果現在每天都在用，有點後悔太晚買\n留言區：${pickReplyLeadIn(input.shopeeShortLink)} ${input.shopeeShortLink}\n有人也跟我一樣相見恨晚的嗎`;
  return { ...splitCopy(raw), raw };
}
