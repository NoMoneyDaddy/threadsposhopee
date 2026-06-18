import { env } from "@/lib/env";

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
      const res = await fetch(mediaUrl);
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
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
