import { assertSafePublicUrl } from "@/lib/url-guard";
import { fetchWithRetry } from "@/lib/http";
import { log } from "@/lib/logger";

// 目的資料夾推導（純函式可測）：有 keyHint（如 <shopId>_<itemId>）就 sanitize（只留英數底線連字號）
// 並截斷 64 字後分到商品資料夾；無 keyHint 則用呼叫端給的 fallback。
export function cloudinaryFolder(keyHint: string | undefined, fallback: string): string {
  if (!keyHint) return fallback;
  // sanitize 後若全被移除（如 keyHint 全是非法字元）→ 退回 fallback，不落到空的 "threads/"。
  const sanitized = keyHint.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  return sanitized ? `threads/${sanitized}` : fallback;
}

// 把來源媒體（Threads CDN 短效 URL）中轉到 Cloudinary，取得穩定 URL 給 Threads 發文用。
// 對應 n8n「下載影片/圖片 → 上傳 Cloudinary」節點。
// creds：使用者「自綁的」Cloudinary（素材進自己雲端）。無 fallback——沒綁就不中轉、沿用原 URL。
export async function uploadToCloudinary(
  sourceUrl: string,
  type: "image" | "video",
  creds?: { cloud: string; preset: string } | null,
  keyHint?: string
): Promise<string> {
  const cloud = creds?.cloud;
  const preset = creds?.preset;
  if (!cloud || !preset) return sourceUrl; // 未綁定自己的 Cloudinary → 沿用原 URL（不使用系統共用設定）

  // SSRF 防護：sourceUrl 可能來自外部來源，擋內網位址（避免 Cloudinary 被當跳板抓內網）
  const safeUrl = assertSafePublicUrl(sourceUrl);

  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/${type}/upload`;
  const form = new FormData();
  form.append("file", safeUrl.href); // Cloudinary 支援直接給遠端 URL 由它抓取（用正規化 href 防解析歧異）
  form.append("upload_preset", preset);
  // 以商品分組（keyHint=<shopId>_<itemId>）；缺時退回舊的 type 分類資料夾。
  form.append("folder", cloudinaryFolder(keyHint, type === "video" ? "threads/videos" : "threads/images"));

  // 影片上傳較慢放寬到 20s；只重試 429（被限流＝未處理，重試不會產生重複資產）。
  // 外部 fetch 前一律過 SSRF 守衛（即使 endpoint 為固定常數，維持全站一致約定）。
  const res = await fetchWithRetry(assertSafePublicUrl(endpoint).href, { method: "POST", body: form }, 20000);
  if (!res.ok) {
    // 上游回應本文可能含帳號細節：只進 log（截斷 500 字），對外僅保留狀態碼避免洩漏。
    log.error("Cloudinary 上傳失敗", { status: res.status, body: (await res.text()).slice(0, 500) });
    throw new Error(`Cloudinary 上傳失敗（${res.status}）`);
  }
  const json = await res.json().catch(() => null);
  // 2xx 但缺 secure_url 視為失敗：避免把無效 URL 當成功往下傳，破壞 service→API 契約。
  if (typeof json?.secure_url !== "string" || !json.secure_url) {
    throw new Error("Cloudinary 上傳回應缺少 secure_url");
  }
  return json.secure_url;
}

// 使用者本機上傳：把檔案 bytes 直接上傳到 Cloudinary（unsigned preset），回傳 secure_url。
export async function uploadBytesToCloudinary(
  body: Buffer,
  contentType: string,
  type: "image" | "video",
  creds: { cloud: string; preset: string },
  keyHint?: string
): Promise<string> {
  const endpoint = `https://api.cloudinary.com/v1_1/${creds.cloud}/${type}/upload`;
  const form = new FormData();
  // 零拷貝：以原 Buffer 的底層 ArrayBuffer 視窗建 Blob，避免再複製一份整檔到記憶體。
  form.append(
    "file",
    new Blob([new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength)], { type: contentType })
  );
  form.append("upload_preset", creds.preset);
  // 與 uploadToCloudinary 一致：有 keyHint（如 <shopId>_<itemId>）就分到對應商品資料夾，否則落 uploads。
  form.append("folder", cloudinaryFolder(keyHint, "threads/uploads"));
  const res = await fetchWithRetry(assertSafePublicUrl(endpoint).href, { method: "POST", body: form }, 20000);
  if (!res.ok) {
    log.error("Cloudinary 上傳失敗", { status: res.status, body: (await res.text()).slice(0, 500) });
    throw new Error(`Cloudinary 上傳失敗（${res.status}）`);
  }
  const json = await res.json().catch(() => null);
  // 2xx 但缺 secure_url 視為失敗：避免把無效 URL 當成功往下傳，破壞 service→API 契約。
  if (typeof json?.secure_url !== "string" || !json.secure_url) {
    throw new Error("Cloudinary 上傳回應缺少 secure_url");
  }
  return json.secure_url;
}
