-- AI 文案客製化：每位使用者的全域偏好（語氣/長度/emoji/溫度/自訂指示）。
-- 非機密，明文 jsonb；空物件視為預設。
alter table profiles add column if not exists copy_prefs jsonb not null default '{}'::jsonb;
do $$ begin
  alter table profiles add constraint profiles_copy_prefs_is_object check (jsonb_typeof(copy_prefs) = 'object');
exception when duplicate_object then null; end $$;
