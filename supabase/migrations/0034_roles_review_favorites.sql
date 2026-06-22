-- 身份組／勳章、共享素材審核、收藏（高黏著度）：
-- 1) profiles.roles：手動賦予的身份組（reviewer 審查員 等；管理員以 owner email 判定，不入此欄）。
-- 2) materials.review_status：共享素材審核狀態（approved 預設＝既有共享照常顯示／pending／removed 下架）。
-- 3) materials.favorite_count + material_favorites：使用者可「收藏」共享素材，收藏數＋匯入數＝頂級素材排序依據。
alter table profiles add column if not exists roles text[] not null default '{}';

alter table materials add column if not exists review_status text not null default 'approved';
alter table materials add column if not exists favorite_count integer not null default 0;

-- 收藏關聯表：一位使用者對一個素材至多一筆（可切換）。
create table if not exists material_favorites (
  owner_id uuid not null,
  material_id uuid not null references materials(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, material_id)
);
create index if not exists idx_material_favorites_owner on material_favorites (owner_id);

-- 切換收藏（原子）：未收藏→新增並 +1，回 true；已收藏→移除並 -1，回 false。
create or replace function toggle_material_favorite(p_owner uuid, p_id uuid)
returns boolean language plpgsql as $$
declare n integer;
begin
  insert into material_favorites(owner_id, material_id) values (p_owner, p_id)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    update materials set favorite_count = favorite_count + 1 where id = p_id;
    return true;
  else
    delete from material_favorites where owner_id = p_owner and material_id = p_id;
    update materials set favorite_count = greatest(favorite_count - 1, 0) where id = p_id;
    return false;
  end if;
end;
$$;

-- 貢獻排行榜：各 owner 的素材被匯入總次數（join 公開代稱 bio_handle 供匿名展示）。
create or replace function top_contributors(p_limit integer)
returns table(owner_id uuid, score integer, bio_handle text)
language sql stable as $$
  select m.owner_id, sum(m.import_count)::int as score, p.bio_handle
  from materials m
  left join profiles p on p.id = m.owner_id
  group by m.owner_id, p.bio_handle
  having sum(m.import_count) > 0
  order by score desc
  limit greatest(p_limit, 0);
$$;
