import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { assertSafePublicUrl, fetchSafePublicUrl } from "@/lib/url-guard";
import { fetchWithRetry } from "@/lib/http";
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
  temperature = 0.9,
  model?: string | null
): Promise<string> {
  const key = apiKey;
  if (!key) throw new Error("無 Gemini 金鑰"); // 先擋空金鑰，避免送出 key=undefined 的必失敗外呼
  const parts: any[] = [{ text: prompt }];

  // 有媒體就抓下來轉 base64 inline（小檔可行；超大檔跳過避免請求超限，純文字生成）
  if (mediaUrl && mediaType !== "none") {
    try {
      // SSRF 防護：媒體 URL 來自外部/使用者，逐跳驗證的安全 fetch（含跟隨重定向每跳重驗），
      // 避免「公網域名 → 302 → 內網」把內網內容讀進記憶體送 Gemini。
      const res = await fetchSafePublicUrl(mediaUrl, {}, 10000);
      // 非 2xx（如 404/500）→ 跳過 inline、純文字生成（fetch 不丟例外，需自行判斷，
      // 否則會把錯誤頁內容當媒體送進 Gemini 導致整體生成失敗）。不可 return：後面還要呼叫 Gemini。
      if (!res.ok) {
        log.warn("媒體抓取回應異常，純文字生成", { status: res.status, mediaUrl });
      } else if (mediaType === "video") {
        // 影片走 Files API：先看 content-length，超過記憶體上限就跳過；否則下載→上傳→取 fileUri。
        const declared = parseInt(res.headers.get("content-length") ?? "", 10);
        if (Number.isFinite(declared) && declared > MAX_FILES_MEDIA_BYTES) {
          log.warn("影片過大跳過，純文字生成", { bytes: declared, mediaUrl });
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > MAX_FILES_MEDIA_BYTES) {
            log.warn("影片過大跳過，純文字生成", { bytes: buf.length, mediaUrl });
          } else {
            const mime = res.headers.get("content-type") ?? "video/mp4";
            const fileUri = await uploadToGeminiFiles(buf, mime, key);
            if (fileUri) parts.push({ fileData: { mimeType: mime, fileUri } });
            else log.warn("影片上傳 Files API 失敗，純文字生成", { mediaUrl });
          }
        }
      } else {
        // 圖片走 inline（base64）：先看 content-length，過大就不讀 body（省頻寬/記憶體）
        const declared = parseInt(res.headers.get("content-length") ?? "", 10);
        if (Number.isFinite(declared) && declared > MAX_INLINE_MEDIA_BYTES) {
          log.warn("圖片過大跳過 inline，純文字生成", { bytes: declared, mediaUrl });
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          if (mediaFitsInline(buf.length)) {
            const mime = res.headers.get("content-type") ?? "image/jpeg";
            parts.push({ inlineData: { mimeType: mime, data: buf.toString("base64") } });
          } else {
            log.warn("圖片過大跳過 inline，純文字生成", { bytes: buf.length, mediaUrl });
          }
        }
      }
    } catch (e) {
      // 媒體抓取失敗 → 記 log 後純文字生成（不擋文案產出）
      log.warn("媒體抓取失敗，純文字生成", { mediaUrl, err: e });
    }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || env.geminiModel}:generateContent?key=${key}`;
  // 不對 429 退避重試（attempts=1）：Gemini 免費層是「每分鐘」配額，30–60s 才回補，遠超我們 16s 退避上限，
  // 重試只會白等數十秒又再 429、還多燒一次配額。直接快速失敗，由呼叫端略過該篇、整批抓取才不會卡很久。
  const res = await fetchWithRetry(assertSafePublicUrl(url).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature, maxOutputTokens: 512 }
    })
  }, 30000, 1);
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

// 純文字生成（無媒體）：給「成效歸因摘要」等非文案用途共用。失敗會拋錯，由呼叫端決定降級。
export async function geminiText(prompt: string, apiKey?: string | null, temperature = 0.4, maxOutputTokens = 400, model?: string | null): Promise<string> {
  const key = apiKey;
  if (!key) throw new Error("無 Gemini 金鑰");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || env.geminiModel}:generateContent?key=${key}`;
  // attempts=1：同上，免費層每分鐘配額不會在退避視窗內回補，重試只是白等。
  const res = await fetchWithRetry(assertSafePublicUrl(url).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    })
  }, 30000, 1);
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 回傳空內容");
  return String(text).trim();
}
