import { env, isDemoMode } from "@/lib/env";
import { buildCopyPrompt, splitCopy, HUMANIZER_RULES, type CopyContext } from "./humanizer";
import { DEFAULT_COPY_PREFS, type CopyPrefs } from "./prefs";
import { generateWithGemini, geminiText } from "./gemini";

export interface GeneratedCopy {
  mainText: string;
  replyText: string;
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
  prefs: CopyPrefs = DEFAULT_COPY_PREFS
): Promise<GeneratedCopy> {
  const prompt = buildCopyPrompt(input, prefs);
  const key = apiKey || null;

  if (isDemoMode || (env.aiProvider === "gemini" && !key)) {
    return demoCopy(input);
  }

  const raw = await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType ?? "none", key, prefs.temperature);
  return { ...splitCopy(raw), raw };
}

// 把同一段正文改寫成 n 個語氣/開頭不同、意思相同的版本（「換個說法」）。
// 保留原文的網址/數字/商品名；版本之間以一行「===」分隔。Demo 或無金鑰回示意版本。
export async function generateVariations(text: string, apiKey?: string | null, n = 3): Promise<string[]> {
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
  const raw = await geminiText(prompt, apiKey, 0.9, 800);
  return raw
    .split(/\n?={3,}\n?/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, n);
}

function demoVariations(text: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `（示意版本 ${i + 1}）${text}`);
}

// Demo 模式：不呼叫外部 API，產出一段示意文案
function demoCopy(input: CopyInput): GeneratedCopy {
  const raw = `正文：${input.productName} 用了快兩週，本來沒抱期待\n結果現在每天都在用，有點後悔太晚買 😅\n留言區：怕你找不到，連結放這 🔗 ${input.shopeeShortLink}\n有人也跟我一樣相見恨晚的嗎`;
  return { ...splitCopy(raw), raw };
}
