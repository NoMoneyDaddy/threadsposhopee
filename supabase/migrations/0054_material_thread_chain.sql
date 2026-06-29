-- 素材支援多段串文（3/n+）：新增 thread_chain（與 drafts 同形狀的 ThreadSegment[]）。
-- 主文＝main_text、留言（2/n）＝reply_text + media(slot=reply)；thread_chain 存「留言之後」的 3/n+ 段落。
-- 冪等：add column if not exists。預設空陣列＝無額外段落（向後相容舊素材）。
alter table materials add column if not exists thread_chain jsonb not null default '[]'::jsonb;
