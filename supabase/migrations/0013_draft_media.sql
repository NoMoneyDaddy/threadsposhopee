-- 多媒體（輪播）：草稿可帶多張圖/片，人工拖拉上傳並排序。
-- 空陣列時退回舊的單一 media 欄位（cloudinary_media_url + media_type），向後相容。
alter table drafts add column if not exists media jsonb not null default '[]'::jsonb;
-- 只允許 JSON 陣列，維持 DraftMedia[] 資料契約（擋掉誤寫物件/字串）
do $$ begin
  alter table drafts add constraint drafts_media_is_array check (jsonb_typeof(media) = 'array');
exception when duplicate_object then null; end $$;
