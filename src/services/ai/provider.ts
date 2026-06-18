import { env, isDemoMode } from "@/lib/env";
import { buildCopyPrompt, splitCopy, type CopyContext } from "./humanizer";
import { generateWithGemini } from "./gemini";

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
export async function generateCopy(input: CopyInput): Promise<GeneratedCopy> {
  const prompt = buildCopyPrompt(input);

  if (isDemoMode || (env.aiProvider === "gemini" && !env.geminiApiKey)) {
    return demoCopy(input);
  }

  let raw: string;
  switch (env.aiProvider) {
    case "gemini":
      raw = await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType ?? "none");
      break;
    default:
      // Claude 等其他 provider 之後可在此擴充
      raw = await generateWithGemini(prompt, input.mediaUrl ?? null, input.mediaType ?? "none");
  }
  return { ...splitCopy(raw), raw };
}

// Demo 模式：不呼叫外部 API，產出一段示意文案
function demoCopy(input: CopyInput): GeneratedCopy {
  const raw = `正文：${input.productName} 用了快兩週，本來沒抱期待\n結果現在每天都在用，有點後悔太晚買 😅\n留言區：怕你找不到，連結放這 🔗 ${input.shopeeShortLink}\n有人也跟我一樣相見恨晚的嗎`;
  return { ...splitCopy(raw), raw };
}
