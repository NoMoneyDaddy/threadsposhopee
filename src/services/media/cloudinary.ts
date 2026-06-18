import { env } from "@/lib/env";
import { assertSafePublicUrl } from "@/lib/url-guard";

// 把來源媒體（Threads CDN 短效 URL）中轉到 Cloudinary，取得穩定 URL 給 Threads 發文用。
// 對應 n8n「下載影片/圖片 → 上傳 Cloudinary」節點。
export async function uploadToCloudinary(
  sourceUrl: string,
  type: "image" | "video"
): Promise<string> {
  if (!env.cloudinaryCloud) return sourceUrl; // 未設定就直接沿用原 URL

  // SSRF 防護：sourceUrl 可能來自外部來源，擋內網位址（避免 Cloudinary 被當跳板抓內網）
  assertSafePublicUrl(sourceUrl);

  const endpoint = `https://api.cloudinary.com/v1_1/${env.cloudinaryCloud}/${type}/upload`;
  const form = new FormData();
  form.append("file", sourceUrl); // Cloudinary 支援直接給遠端 URL 由它抓取
  form.append("upload_preset", env.cloudinaryPreset);
  form.append("folder", type === "video" ? "threads/videos" : "threads/images");

  const res = await fetch(endpoint, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary 上傳失敗 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.secure_url as string;
}
