-- 防自刷排名：全站實際成效改計「發布過該商品的『不重複發文者』數」，而非原始貼文數。
-- 原本 count(*) 讓分享者對自己商品反覆發文即可拉高自己共享素材的排名；改 count(distinct owner)
-- 後，單一帳號無論發幾次都只計 1，熱度改由「多少不同人採用發布」決定，貼近真實成效。
create or replace function public.product_published_counts()
returns table(shop_id text, item_id text, published bigint)
language sql
stable
security definer
set search_path = public
as $$
  select m.shop_id, m.item_id, count(distinct d.owner_id)::bigint as published
  from drafts d
  join materials m on m.id = d.material_id
  where d.status = 'published' and m.shop_id is not null and m.item_id is not null
  group by m.shop_id, m.item_id
$$;
