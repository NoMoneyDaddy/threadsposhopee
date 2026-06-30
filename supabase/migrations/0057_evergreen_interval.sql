-- 常青回收間隔可由使用者自設（天）：profiles.evergreen_interval_days（NULL＝沿用系統預設）。
alter table profiles add column if not exists evergreen_interval_days int;

-- 列出「到期」常青素材：依各 owner 自設間隔（無則用 p_default_days）比對 evergreen_last_at。
-- 取代原本單一全域 cutoff 的查詢（無法表達每列不同的間隔）。回傳整列 materials 供既有 mapper 使用。
create or replace function list_evergreen_due(p_default_days int, p_limit int)
returns setof materials
language sql stable as $$
  select m.*
  from materials m
  left join profiles p on p.id = m.owner_id
  where m.evergreen is true
    and m.affiliate_valid is true
    and (
      m.evergreen_last_at is null
      or m.evergreen_last_at < now() - (greatest(1, coalesce(p.evergreen_interval_days, p_default_days)) || ' days')::interval
    )
  order by m.evergreen_last_at asc nulls first
  limit greatest(p_limit, 0);
$$;
