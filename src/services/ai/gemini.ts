import { env } from "@/lib/env";
import { assertSafePublicUrl } from "@/lib/url-guard";

// 直接呼叫 Gemini REST API（不額外裝 SDK）。支援把圖片/影片 URL 當多模態輸入。
export async function generateWithGemini(
  prompt: string,
  mediaUrl: string | null,
  mediaType: "image" | "video" | "none"
): Promise<string> {
  const parts: any[] = [{ text: prompt }];

  // 有媒體就抓下來轉 base64 inline（小檔可行；大影片建議改用 Files API，TODO）
  if (mediaUrl && mediaType !== "none") {
    try {
      // SSRF 防護：媒體 URL 可能來自外部來源/使用者貼上，先擋內網位址，並用正規化 href fetch（防解析歧異）
      const safeUrl = assertSafePublicUrl(mediaUrl);
      const res = await fetch(safeUrl.href);
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = res.headers.get("content-type") ?? (mediaType === "video" ? "video/mp4" : "image/jpeg");
      parts.push({ inlineData: { mimeType: mime, data: buf.toString("base64") } });
    } catch {
      // 媒體抓取失敗就純文字生成
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 512 }
    })
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const finishReason = json?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      throw new Error(`Gemini 生成中止，原因: ${finishReason}`);
    }
    throw new Error("Gemini 回傳空內容（可能被安全過濾器攔截）");
  }
  return text;
}
