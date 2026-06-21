import { assertSafePublicUrl } from "@/lib/url-guard";
import { fetchWithRetry } from "@/lib/http";
import { log } from "@/lib/logger";

// 把來源媒體（Threads CDN 短效 URL）中轉到 Cloudinary，取得穩定 URL 給 Threads 發文用。
// 對應 n8n「下載影片/圖片 → 上傳 Cloudinary」節點。
// creds：使用者「自綁的」Cloudinary（素材進自己雲端）。無 fallback——沒綁就不中轉、沿用原 URL。
export async function uploadToCloudinary(
  sourceUrl: string,
  type: "image" | "video",
  creds?: { cloud: string; preset: string } | null
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
  form.append("folder", type === "video" ? "threads/videos" : "threads/images");

  // 影片上傳較慢放寬到 20s；只重試 429（被限流＝未處理，重試不會產生重複資產）。
  // 外部 fetch 前一律過 SSRF 守衛（即使 endpoint 為固定常數，維持全站一致約定）。
  const res = await fetchWithRetry(assertSafePublicUrl(endpoint).href, { method: "POST", body: form }, 20000);
  if (!res.ok) {
    // 上游回應本文可能含帳號細節：只進 log（截斷 500 字），對外僅保留狀態碼避免洩漏。
    log.error("Cloudinary 上傳失敗", { status: res.status, body: (await res.text()).slice(0, 500) });
    throw new Error(`Cloudinary 上傳失敗（${res.status}）`);
  }
  const json = await res.json();
  return json.secure_url as string;
}
