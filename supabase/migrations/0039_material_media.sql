-- 素材多媒體（同一篇貼文的影片＋圖）：空陣列時退回單一 media 欄位（向後相容）。
alter table materials add column if not exists media jsonb not null default '[]'::jsonb;
do $$ begin
  alter table materials add constraint materials_media_is_array check (jsonb_typeof(media) = 'array');
exception when duplicate_object then null; end $$;
