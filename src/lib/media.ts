import type { Draft, DraftMedia } from "@/lib/types";

// 草稿媒體正規化：優先用 media 陣列（人工拖拉上傳/排序），
// 為空時退回舊的單一 media 欄位（cloudinary_media_url + media_type），確保向後相容。
// 一律過濾掉無效項（缺 url 或 type 不對），避免髒資料流到發布端。
export function normalizeDraftMedia(
  d: Pick<Draft, "media" | "cloudinary_media_url" | "source_media_url" | "media_type">
): DraftMedia[] {
  if (Array.isArray(d.media) && d.media.length > 0) {
    const normalized = d.media.filter(
      (m): m is DraftMedia =>
        Boolean(m) && typeof m.url === "string" && m.url.length > 0 && (m.type === "image" || m.type === "video")
    );
    // 全被過濾掉時不要誤降級成純文字，繼續退回舊欄位
    if (normalized.length > 0) return normalized;
  }
  const url = d.cloudinary_media_url || d.source_media_url;
  if (url && (d.media_type === "image" || d.media_type === "video")) {
    return [{ url, type: d.media_type }];
  }
  return [];
}

// 留言（2/2）媒體：僅過濾無效項，不退回舊單一欄位（舊欄位屬主文媒體，不應外溢到留言）。
export function normalizeReplyMedia(d: Pick<Draft, "reply_media">): DraftMedia[] {
  if (!Array.isArray(d.reply_media)) return [];
  return d.reply_media.filter(
    (m): m is DraftMedia =>
      Boolean(m) && typeof m.url === "string" && m.url.length > 0 && (m.type === "image" || m.type === "video")
  );
}

// 合格素材組：至少 1 部影片 + 至少 1 張圖片（跨主文＋留言的所有媒體一起算）。
export function isQualifiedMediaSet(media: DraftMedia[]): boolean {
  const hasVideo = media.some((m) => m.type === "video");
  const hasImage = media.some((m) => m.type === "image");
  return hasVideo && hasImage;
}
