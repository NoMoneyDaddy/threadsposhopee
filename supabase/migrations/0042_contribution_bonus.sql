-- 貢獻分數統一到 SQL 單一來源，並納入「資料貢獻紅利」（contribution_bonus）。
-- 紅利：用自己的 Shopee 金鑰把「分享進公共池」的素材補上商品資料（首次補上分潤率）記一次（見 linkcheck）。
alter table profiles add column if not exists contribution_bonus integer not null default 0;

-- 原子累加資料貢獻紅利。
create or replace function increment_contribution_bonus(p_owner uuid, p_n integer)
returns void language sql as $$
  update profiles set contribution_bonus = contribution_bonus + greatest(p_n, 0) where id = p_owner;
$$;

-- 個人貢獻分數 = 被匯入次數 + 分享中素材篇數 + 資料貢獻紅利。
create or replace function get_contribution_score(p_owner uuid)
returns integer language sql stable as $$
  select (
    coalesce((select sum(import_count) + count(*) filter (where shared is true)
              from materials where owner_id = p_owner), 0)
    + coalesce((select contribution_bonus from profiles where id = p_owner), 0)
  )::int;
$$;

-- 排行榜同口徑（被匯入 + 分享篇數 + 資料貢獻紅利）。
create or replace function top_contributors(p_limit integer)
returns table(owner_id uuid, score integer, bio_handle text)
language sql stable as $$
  select m.owner_id,
         (sum(m.import_count) + count(*) filter (where m.shared is true) + coalesce(p.contribution_bonus, 0))::int as score,
         p.bio_handle
  from materials m
  left join profiles p on p.id = m.owner_id
  group by m.owner_id, p.bio_handle, p.contribution_bonus
  having (sum(m.import_count) + count(*) filter (where m.shared is true) + coalesce(p.contribution_bonus, 0)) > 0
  order by score desc
  limit greatest(p_limit, 0);
$$;
