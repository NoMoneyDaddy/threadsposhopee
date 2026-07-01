-- 貢獻分數改「重質」：核心＝被匯入次數（別人真的選用）×3；優質素材（被匯入≥3 的分享素材）×5；
-- 移除「分享篇數無條件加分」（灌水洞）；保留資料貢獻紅利。避免大量分享爛商品速成高分。
-- create or replace 會重置函式屬性 → 一併重設 search_path=public（沿用 0061 的安全強化）。
create or replace function get_contribution_score(p_owner uuid)
returns integer language sql stable set search_path = public as $$
  select (
    coalesce((
      select sum(import_count) * 3 + (count(*) filter (where shared is true and import_count >= 3)) * 5
      from materials where owner_id = p_owner
    ), 0)
    + coalesce((select contribution_bonus from profiles where id = p_owner), 0)
  )::int;
$$;

-- 排行榜同口徑（重質）。
create or replace function top_contributors(p_limit integer)
returns table(owner_id uuid, score integer, bio_handle text, display_name text)
language sql stable set search_path = public as $$
  select m.owner_id,
         (sum(m.import_count) * 3 + (count(*) filter (where m.shared is true and m.import_count >= 3)) * 5 + coalesce(p.contribution_bonus, 0))::int as score,
         p.bio_handle,
         p.display_name
  from materials m
  left join profiles p on p.id = m.owner_id
  group by m.owner_id, p.bio_handle, p.display_name, p.contribution_bonus
  having (sum(m.import_count) * 3 + (count(*) filter (where m.shared is true and m.import_count >= 3)) * 5 + coalesce(p.contribution_bonus, 0)) > 0
  order by score desc
  limit greatest(p_limit, 0);
$$;
