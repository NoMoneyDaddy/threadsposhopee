// 本機上傳媒體的 MIME 白名單與大小上限（前後端共用，純函式便於單測）。
// 上傳走 server 中轉、整檔讀進記憶體，故上限以「記憶體安全」為準（非平台 body 限制）。
export const MAX_IMAGE_MB = 10;
export const MAX_VIDEO_MB = 50;

// 只放行明確的圖片／影片 MIME；不再用「非影片即圖片」的寬鬆預設，擋掉偽裝副檔名或未知型別。
export function classifyMediaMime(mime: string): "image" | "video" | null {
  if (/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(mime)) return "image";
  if (/^video\/(mp4|quicktime|webm|x-matroska)$/.test(mime)) return "video";
  return null;
}

// 驗證單檔型別與大小：通過回 {type}，否則回 {error}（給使用者看的訊息）。
export function checkUploadFile(
  mime: string,
  size: number,
  name = "檔案"
): { type: "image" | "video" } | { error: string } {
  const type = classifyMediaMime(mime);
  if (!type) return { error: `「${name}」型別不支援（僅接受常見圖片／影片）` };
  const maxMB = type === "video" ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (size > maxMB * 1024 * 1024) return { error: `「${name}」過大（上限 ${maxMB}MB）` };
  return { type };
}
