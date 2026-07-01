-- 發文成效追蹤：每篇已發布貼文的 Threads 互動數據（views/likes），關聯到商品（shop+item）。
-- 供共享庫/選品雷達排序的「全站實際成效」用（比純發布數更準）。由 cron 分批回填（受 Threads API 額度限制）。
create table if not exists post_metrics (
  draft_id uuid primary key references drafts(id) on delete cascade,
  owner_id uuid,
  shop_id text,
  item_id text,
  views integer not null default 0,
  likes integer not null default 0,
  fetched_at timestamptz not null default now()
);
create index if not exists post_metrics_product_idx on post_metrics(shop_id, item_id);
create index if not exists post_metrics_fetched_idx on post_metrics(fetched_at);
-- App 一律走 service-role（繞 RLS）；開 RLS 不建 policy＝對 anon/authenticated 全擋（與其他表同模式）。
alter table post_metrics enable row level security;

-- 待回填清單：已發布、有貼文 id、30 天內、且尚未有成效或成效過舊者（最久沒更新優先）。
create or replace function public.published_posts_needing_metrics(p_limit integer, p_stale timestamptz, p_since timestamptz)
returns table(draft_id uuid, owner_id uuid, threads_account_id uuid, published_post_id text, shop_id text, item_id text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.owner_id, d.threads_account_id, d.published_post_id, m.shop_id, m.item_id
  from drafts d
  join materials m on m.id = d.material_id
  left join post_metrics pm on pm.draft_id = d.id
  where d.status = 'published' and d.published_post_id is not null
    and d.published_at >= p_since
    and m.shop_id is not null and m.item_id is not null
    and (pm.draft_id is null or pm.fetched_at < p_stale)
  order by pm.fetched_at asc nulls first
  limit p_limit
$$;

-- 全站每商品互動加總（views/likes）：供排序加權。
create or replace function public.product_engagement()
returns table(shop_id text, item_id text, views bigint, likes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select shop_id, item_id, sum(views)::bigint as views, sum(likes)::bigint as likes
  from post_metrics
  where shop_id is not null and item_id is not null
  group by shop_id, item_id
$$;
