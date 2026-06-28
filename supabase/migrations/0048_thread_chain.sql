-- 多段串文（3 則以上）：主文之後要依序補發的段落鏈。
-- thread_chain：段落陣列（[{ text, media }]），空＝沿用舊單則 reply_text/reply_media（向後相容）。
-- thread_cursor：下一個要補發的段落索引（0-based）。
-- thread_last_post_id：上一段成功發出的貼文 id（下一段的 reply_to 對象；cursor=0 時用 published_post_id）。
alter table drafts add column if not exists thread_chain jsonb not null default '[]'::jsonb;
alter table drafts add column if not exists thread_cursor int not null default 0;
alter table drafts add column if not exists thread_last_post_id text;

do $$ begin
  alter table drafts add constraint drafts_thread_chain_is_array check (jsonb_typeof(thread_chain) = 'array');
exception when duplicate_object then null; end $$;
