// Cloudinary 縮圖：為 /upload/ 圖片插入 f_auto,q_auto,w_<width> transform（自動格式/壓縮/限寬），
// 大幅降低頻寬與 LCP。非 Cloudinary 或已帶 transform 的 URL 原樣返回。純函式可測。
export function cloudinaryThumb(url: string | null | undefined, width: number): string {
  if (!url) return "";
  const marker = "/upload/";
  const i = url.indexOf(marker);
  if (!url.includes("cloudinary.com") || i < 0) return url;
  const after = url.slice(i + marker.length);
  if (/^[a-z]+_/.test(after)) return url; // 已有 transform（如 f_/w_/c_/v 之外的參數段）
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,w_${width}/${after}`;
}
