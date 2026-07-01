-- 全站實際成效：每個商品（shop_id+item_id）在全站被「實際發布」的貼文數。
-- 供共享庫/選品雷達排序用（熱門＝被匯入數，成效＝全站實際發文數）。
-- SECURITY DEFINER＋固定 search_path：跨租戶彙總（App 走 service-role，本 RPC 亦可安全呼叫）。
create or replace function public.product_published_counts()
returns table(shop_id text, item_id text, published bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.shop_id, m.item_id, count(*)::bigint as published
  from drafts d
  join materials m on m.id = d.material_id
  where d.status = 'published' and m.shop_id is not null and m.item_id is not null
  group by m.shop_id, m.item_id
$$;
