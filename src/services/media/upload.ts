// 圖床派發：使用者可二擇一綁定 Cloudflare R2 或 Cloudinary（R2 優先）。都沒綁則沿用來源原 URL。
// 一個 owner 解析一次 provider，餵給整批上傳，避免每張圖都查一次 DB。
import { getUserR2, getUserCloudinary, type R2Settings } from "@/lib/store";
import { uploadToR2, uploadBytesToR2 } from "./r2";
import { uploadToCloudinary, uploadBytesToCloudinary } from "./cloudinary";

export type MediaProvider =
  | { kind: "r2"; creds: R2Settings }
  | { kind: "cloudinary"; creds: { cloud: string; preset: string } }
  | { kind: "none" };

// 解析使用者偏好的圖床（R2 優先於 Cloudinary）。
// 不在此吞例外：getUserR2／getUserCloudinary 已「刻意」把 DB 讀取錯誤降級為 log.warn＋回 null
// （見 credentials.ts，供 pipeline 在迴圈外取一次時不因暫時性錯誤中斷整條 run）。故此處 none＝確定未綁定，
// 而非查詢故障；若日後 getter 改為拋錯，這裡也會往上拋（不再用多餘的 .catch 把故障誤判成未綁定）。
export async function getMediaProvider(ownerId: string): Promise<MediaProvider> {
  const r2 = await getUserR2(ownerId);
  if (r2) return { kind: "r2", creds: r2 };
  const cl = await getUserCloudinary(ownerId);
  if (cl) return { kind: "cloudinary", creds: cl };
  return { kind: "none" };
}

// 用已解析的 provider 中轉一個媒體；none 直接回原 URL，失敗則由呼叫端 try/catch fallback。
// keyHint：物件命名分組提示（如 <shopId>_<itemId>），讓同商品媒體落同一資料夾、可回溯。
export async function uploadMediaWith(
  provider: MediaProvider,
  sourceUrl: string,
  type: "image" | "video",
  keyHint?: string
): Promise<string> {
  if (provider.kind === "r2") return uploadToR2(sourceUrl, type, provider.creds, keyHint);
  if (provider.kind === "cloudinary") return uploadToCloudinary(sourceUrl, type, provider.creds, keyHint);
  return sourceUrl;
}

// 使用者本機上傳：把檔案 bytes 經 server 中轉到使用者綁定的圖床（R2 或 Cloudinary）。none 則拋錯（呼叫端轉 400）。
export async function uploadBytesWith(
  provider: MediaProvider,
  body: Buffer,
  contentType: string,
  type: "image" | "video",
  keyHint?: string
): Promise<string> {
  if (provider.kind === "r2") return uploadBytesToR2(body, contentType, type, provider.creds, keyHint);
  if (provider.kind === "cloudinary") return uploadBytesToCloudinary(body, contentType, type, provider.creds, keyHint);
  throw new Error("尚未綁定圖床");
}
