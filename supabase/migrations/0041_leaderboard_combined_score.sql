-- 排行榜分數與個人貢獻分數對齊：納入「分享素材篇數」。
-- 分數 = 被匯入次數總和 + 目前分享中的素材篇數（與 contribution.ts combinedContributionScore 一致，權重皆 1）。
create or replace function top_contributors(p_limit integer)
returns table(owner_id uuid, score integer, bio_handle text)
language sql stable as $$
  select m.owner_id,
         (sum(m.import_count) + count(*) filter (where m.shared is true))::int as score,
         p.bio_handle
  from materials m
  left join profiles p on p.id = m.owner_id
  group by m.owner_id, p.bio_handle
  having (sum(m.import_count) + count(*) filter (where m.shared is true)) > 0
  order by score desc
  limit greatest(p_limit, 0);
$$;
