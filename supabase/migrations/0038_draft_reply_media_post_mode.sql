-- 主文／留言媒體拆分 + 發布版面：
-- reply_media：留言（串文 2/2）要帶的媒體（通常 1 張圖）。空陣列＝純文字留言（向後相容）。
-- post_mode：null/'split'＝主文媒體＋留言（含分潤連結＋reply_media）；
--            'all_in_main'＝全部發主文（影片＋圖＋連結同一篇，不另發留言）。
alter table drafts add column if not exists reply_media jsonb not null default '[]'::jsonb;
do $$ begin
  alter table drafts add constraint drafts_reply_media_is_array check (jsonb_typeof(reply_media) = 'array');
exception when duplicate_object then null; end $$;
alter table drafts add column if not exists post_mode text;
