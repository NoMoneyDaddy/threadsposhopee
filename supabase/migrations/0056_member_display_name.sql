-- 會員平台暱稱（display_name）：成員自訂的站內顯示名稱，用於頂部 header 與貢獻排行榜（非機密，明文）。
-- 與 bio_handle（公開 link-in-bio 代稱、僅英數底線連字號）不同：display_name 是站內顯示用、可含中文與空白。
alter table profiles add column if not exists display_name text;

-- 排行榜一併回傳 display_name（顯示優先序由呼叫端決定：display_name > bio_handle > 會員#id）。
-- 回傳型別新增欄位，無法用 create or replace 改既有函式 → 先 drop（冪等）再建。
drop function if exists top_contributors(integer);
create or replace function top_contributors(p_limit integer)
returns table(owner_id uuid, score integer, bio_handle text, display_name text)
language sql stable as $$
  select m.owner_id,
         (sum(m.import_count) + count(*) filter (where m.shared is true) + coalesce(p.contribution_bonus, 0))::int as score,
         p.bio_handle,
         p.display_name
  from materials m
  left join profiles p on p.id = m.owner_id
  group by m.owner_id, p.bio_handle, p.display_name, p.contribution_bonus
  having (sum(m.import_count) + count(*) filter (where m.shared is true) + coalesce(p.contribution_bonus, 0)) > 0
  order by score desc
  limit greatest(p_limit, 0);
$$;
