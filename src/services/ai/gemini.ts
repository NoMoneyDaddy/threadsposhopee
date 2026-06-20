import { env } from "@/lib/env";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { fetchWithTimeout } from "@/lib/http";
import { uploadToGeminiFiles } from "./gemini-files";

// Gemini inline data 上限約 20MB（含 base64 膨脹約 1.34x）→ 二進位設 12MB 安全門檻。
// 圖片超過就跳過 inline、純文字生成（避免送出超限請求讓整個文案生成失敗）。
export const MAX_INLINE_MEDIA_BYTES = 12 * 1024 * 1024;
// 影片走 Files API（resumable upload，不受 inline 上限）；但仍設記憶體上限避免下載超大檔 OOM。
export const MAX_FILES_MEDIA_BYTES = 100 * 1024 * 1024;
export function mediaFitsInline(byteLength: number, max = MAX_INLINE_MEDIA_BYTES): boolean {
  return Number.isFinite(byteLength) && byteLength > 0 && byteLength <= max;
}

// 直接呼叫 Gemini REST API（不額外裝 SDK）。支援把圖片/影片 URL 當多模態輸入。
export async function generateWithGemini(
  prompt: string,
  mediaUrl: string | null,
  mediaType: "image" | "video" | "none",
  apiKey?: string | null,
  temperature = 0.9
): Promise<string> {
  const parts: any[] = [{ text: prompt }];

  // 有媒體就抓下來轉 base64 inline（小檔可行；超大檔跳過避免請求超限，純文字生成）
  if (mediaUrl && mediaType !== "none") {
    try {
      // SSRF 防護：媒體 URL 可能來自外部來源/使用者貼上，先擋內網位址，並用正規化 href fetch（防解析歧異）
      const safeUrl = assertSafePublicUrl(mediaUrl);
      const res = await fetchWithTimeout(safeUrl.href, {}, 10000);
      // 非 2xx（如 404/500）→ 跳過 inline、純文字生成（fetch 不丟例外，需自行判斷，
      // 否則會把錯誤頁內容當媒體送進 Gemini 導致整體生成失敗）。不可 return：後面還要呼叫 Gemini。
      if (!res.ok) {
        console.warn(`媒體抓取回應異常（${res.status}）跳過，純文字生成：${mediaUrl}`);
      } else if (mediaType === "video") {
        // 影片走 Files API：先看 content-length，超過記憶體上限就跳過；否則下載→上傳→取 fileUri。
        const declared = parseInt(res.headers.get("content-length") ?? "", 10);
        const key = apiKey || env.geminiApiKey;
        if (Number.isFinite(declared) && declared > MAX_FILES_MEDIA_BYTES) {
          console.warn(`影片過大（${declared} bytes）跳過，純文字生成：${mediaUrl}`);
        } else if (!key) {
          console.warn(`無 Gemini 金鑰，影片跳過，純文字生成：${mediaUrl}`);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > MAX_FILES_MEDIA_BYTES) {
            console.warn(`影片過大（${buf.length} bytes）跳過，純文字生成：${mediaUrl}`);
          } else {
            const mime = res.headers.get("content-type") ?? "video/mp4";
            const fileUri = await uploadToGeminiFiles(buf, mime, key);
            if (fileUri) parts.push({ fileData: { mimeType: mime, fileUri } });
            else console.warn(`影片上傳 Files API 失敗，純文字生成：${mediaUrl}`);
          }
        }
      } else {
        // 圖片走 inline（base64）：先看 content-length，過大就不讀 body（省頻寬/記憶體）
        const declared = parseInt(res.headers.get("content-length") ?? "", 10);
        if (Number.isFinite(declared) && declared > MAX_INLINE_MEDIA_BYTES) {
          console.warn(`圖片過大（${declared} bytes）跳過 inline，純文字生成：${mediaUrl}`);
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (mediaFitsInline(buf.length)) {
            const mime = res.headers.get("content-type") ?? "image/jpeg";
            parts.push({ inlineData: { mimeType: mime, data: buf.toString("base64") } });
          } else {
            console.warn(`圖片過大（${buf.length} bytes）跳過 inline，純文字生成：${mediaUrl}`);
          }
        }
      }
    } catch (e) {
      // 媒體抓取失敗 → 記 log 後純文字生成（不擋文案產出）
      console.warn(`媒體抓取失敗，純文字生成：${mediaUrl}`, e instanceof Error ? e.message : e);
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${apiKey || env.geminiApiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, maxOutputTokens: 512 }
    })
  }, 30000); // 生成較慢，放寬到 30s
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
