-- 瀏覽器 Web Push 訂閱（每位使用者可多裝置）。endpoint 全域唯一（同裝置重訂以 upsert 取代）。
-- p256dh／auth 為 Push API 提供的公開金鑰與驗證祕密（非伺服器機密，存明文即可）。
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_owner_idx on push_subscriptions(owner_id);
