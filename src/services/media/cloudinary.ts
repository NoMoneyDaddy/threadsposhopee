import { env } from "@/lib/env";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { fetchWithTimeout } from "@/lib/http";

// 把來源媒體（Threads CDN 短效 URL）中轉到 Cloudinary，取得穩定 URL 給 Threads 發文用。
// 對應 n8n「下載影片/圖片 → 上傳 Cloudinary」節點。
export async function uploadToCloudinary(
  sourceUrl: string,
  type: "image" | "video"
): Promise<string> {
  if (!env.cloudinaryCloud) return sourceUrl; // 未設定就直接沿用原 URL

  // SSRF 防護：sourceUrl 可能來自外部來源，擋內網位址（避免 Cloudinary 被當跳板抓內網）
  const safeUrl = assertSafePublicUrl(sourceUrl);

  const endpoint = `https://api.cloudinary.com/v1_1/${env.cloudinaryCloud}/${type}/upload`;
  const form = new FormData();
  form.append("file", safeUrl.href); // Cloudinary 支援直接給遠端 URL 由它抓取（用正規化 href 防解析歧異）
  form.append("upload_preset", env.cloudinaryPreset);
  form.append("folder", type === "video" ? "threads/videos" : "threads/images");

  const res = await fetchWithTimeout(endpoint, { method: "POST", body: form }, 20000); // 影片上傳較慢，放寬到 20s
  if (!res.ok) throw new Error(`Cloudinary 上傳失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.secure_url as string;
}
