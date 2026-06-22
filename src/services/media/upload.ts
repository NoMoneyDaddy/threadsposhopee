// 圖床派發：使用者可二擇一綁定 Cloudflare R2 或 Cloudinary（R2 優先）。都沒綁則沿用來源原 URL。
// 一個 owner 解析一次 provider，餵給整批上傳，避免每張圖都查一次 DB。
import { getUserR2, getUserCloudinary, type R2Settings } from "@/lib/store";
import { uploadToR2 } from "./r2";
import { uploadToCloudinary } from "./cloudinary";

export type MediaProvider =
  | { kind: "r2"; creds: R2Settings }
  | { kind: "cloudinary"; creds: { cloud: string; preset: string } }
  | { kind: "none" };

// 解析使用者偏好的圖床（R2 優先於 Cloudinary）。
export async function getMediaProvider(ownerId: string): Promise<MediaProvider> {
  const r2 = await getUserR2(ownerId).catch(() => null);
  if (r2) return { kind: "r2", creds: r2 };
  const cl = await getUserCloudinary(ownerId).catch(() => null);
  if (cl) return { kind: "cloudinary", creds: cl };
  return { kind: "none" };
}

// 用已解析的 provider 中轉一個媒體；none 直接回原 URL，失敗則由呼叫端 try/catch fallback。
export async function uploadMediaWith(
  provider: MediaProvider,
  sourceUrl: string,
  type: "image" | "video"
): Promise<string> {
  if (provider.kind === "r2") return uploadToR2(sourceUrl, type, provider.creds);
  if (provider.kind === "cloudinary") return uploadToCloudinary(sourceUrl, type, provider.creds);
  return sourceUrl;
}
