-- 匯入額度（give-to-get）：記錄使用者已用的匯入次數。額度＝基礎 ＋ 你分享到共享庫的素材數×倍數，
-- 讓「只拿不給」的人受限、鼓勵上傳分享（初始 0 分享只能匯入基礎額度）。
alter table profiles add column if not exists imports_used integer not null default 0;

-- 原子累加已用匯入次數（無 profiles 列則建立）。
create or replace function increment_imports_used(p_owner uuid)
returns void language sql set search_path = public as $$
  insert into profiles (id, imports_used) values (p_owner, 1)
  on conflict (id) do update set imports_used = profiles.imports_used + 1;
$$;
