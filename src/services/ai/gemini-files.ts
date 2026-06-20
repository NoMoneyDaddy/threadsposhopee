// Gemini Files API（resumable upload）：把媒體上傳取得 fileUri，供 generateContent 以 fileData 引用。
// 用於大影片——inline base64 會超過請求上限，Files API 才是正解。不額外裝 SDK，直接打 REST。
import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";
import { assertSafePublicUrl } from "@/lib/url-guard";

const API = "https://generativelanguage.googleapis.com";

// 上傳 bytes 並輪詢至 ACTIVE，回 fileUri；任何失敗回 null（呼叫端優雅降級為純文字）。
export async function uploadToGeminiFiles(bytes: Buffer, mime: string, apiKey: string): Promise<string | null> {
  try {
    // 1) 開始 resumable upload，取得實際上傳 URL
    const startUrl = assertSafePublicUrl(`${API}/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`).href;
    const start = await fetchWithTimeout(
      startUrl,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(bytes.length),
          "X-Goog-Upload-Header-Content-Type": mime,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ file: { display_name: "media" } })
      },
      15000
    );
    if (!start.ok) return null;
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!uploadUrl) return null;

    // 2) 上傳全部 bytes 並 finalize
    const up = await fetchWithTimeout(
      assertSafePublicUrl(uploadUrl).href,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Offset": "0",
          "X-Goog-Upload-Command": "upload, finalize"
        },
        // undici fetch 執行期接受 Uint8Array body；型別轉換避開 Buffer/DOM lib 摩擦。fetch 自動帶 Content-Length。
        body: new Uint8Array(bytes) as unknown as BodyInit
      },
      60000
    );
    if (!up.ok) return null;
    let file = (await up.json())?.file as { name?: string; uri?: string; state?: string } | undefined;
    if (!file?.name || !file?.uri) return null;

    // 3) 輪詢至 ACTIVE（影片需處理時間）；FAILED 或逾時回 null
    const getUrl = assertSafePublicUrl(`${API}/v1beta/${file.name}?key=${encodeURIComponent(apiKey)}`).href;
    for (let i = 0; i < 10 && file.state !== "ACTIVE"; i++) {
      if (file.state === "FAILED") return null;
      await new Promise((r) => setTimeout(r, 2000));
      const g = await fetchWithTimeout(getUrl, {}, 10000);
      if (!g.ok) return null;
      file = (await g.json()) as { name?: string; uri?: string; state?: string };
    }
    return file.state === "ACTIVE" ? file.uri ?? null : null;
  } catch (e) {
    log.warn("Gemini Files 上傳失敗", { err: e });
    return null;
  }
}
