-- 共享素材：原子累加匯入次數、貢獻分數聚合（避免讀-加-寫競態與多次往返）。
create or replace function increment_material_import(p_id uuid)
returns void language sql as $$
  update materials set import_count = import_count + 1 where id = p_id;
$$;

-- 貢獻分數＝該使用者所有素材被匯入次數總和（不限目前是否仍在共享，取消分享不該歸零歷史貢獻）。
create or replace function get_contribution_score(p_owner uuid)
returns integer language sql stable as $$
  select coalesce(sum(import_count), 0)::int from materials where owner_id = p_owner;
$$;

-- 高貢獻者回饋方式：exempt＝免每日贊助文；own_link＝贊助文換成自己的分潤連結（自己賺）。
alter table profiles add column if not exists sponsor_reward_mode text not null default 'exempt';
