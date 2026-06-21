-- go2read 中轉導流：自有短連結。code 全域唯一；source 為最終要去的來源，
-- affiliate 為（選填）分潤/導流連結。clicks=中轉頁瀏覽、continues=按「繼續」數。
-- 多租戶：owner_id 過濾由應用層帶（service-role 繞 RLS）。中轉頁本身對外公開（訪客點連結）。
create table if not exists redirect_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  source_url text not null,
  affiliate_url text,
  title text,
  image_url text,
  description text,
  clicks int not null default 0,
  continues int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists redirect_links_owner_idx on redirect_links(owner_id);

-- 原子計數（避免讀改寫競態）。SECURITY DEFINER 讓中轉頁可在無 owner 情境下累加。
create or replace function bump_redirect_click(p_code text) returns void
  language sql security definer set search_path = public as $$
  update redirect_links set clicks = clicks + 1 where code = p_code;
$$;

create or replace function bump_redirect_continue(p_code text) returns void
  language sql security definer set search_path = public as $$
  update redirect_links set continues = continues + 1 where code = p_code;
$$;
