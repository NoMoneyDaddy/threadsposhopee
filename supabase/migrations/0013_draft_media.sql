-- 多媒體（輪播）：草稿可帶多張圖/片，人工拖拉上傳並排序。
-- 空陣列時退回舊的單一 media 欄位（cloudinary_media_url + media_type），向後相容。
alter table drafts add column if not exists media jsonb not null default '[]'::jsonb;
