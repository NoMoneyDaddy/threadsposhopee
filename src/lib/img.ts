// Cloudinary 縮圖：為 /upload/ 圖片插入 f_auto,q_auto,w_<width> transform（自動格式/壓縮/限寬），
// 大幅降低頻寬與 LCP。非 Cloudinary 或已帶 transform 的 URL 原樣返回。純函式可測。
export function cloudinaryThumb(url: string | null | undefined, width: number): string {
  if (!url) return "";
  const marker = "/upload/";
  const i = url.indexOf(marker);
  if (!url.includes("cloudinary.com") || i < 0) return url;
  const after = url.slice(i + marker.length);
  // 判定第一段是否已是 transform：逗號拆分後每段皆為短鍵參數（w_/q_/dpr_ 等，鍵長 1–3）。
  // 用「每段皆符合」避免把 product_images/ 這類含底線資料夾誤判為 transform 而跳過優化。
  const firstSegment = after.split("/")[0];
  const isTransform = firstSegment.length > 0 && firstSegment.split(",").every((part) => /^[a-z]{1,3}_/.test(part));
  if (isTransform) return url;
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,w_${width}/${after}`;
}
