-- ThreadsPoShopee 初始 schema
-- 設計重點：多 Threads 帳號、多監看來源、AI 草稿審核佇列、排程、發文去重、加密憑證。

create extension if not exists "pgcrypto";

-- ── 使用者（對應 Supabase Auth 的 auth.users）──────────────────
-- 這裡只放應用層需要的 profile，登入由 Supabase Auth 處理。
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ── Threads 發文帳號（多帳號核心）─────────────────────────────
create table if not exists threads_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  label text not null,                       -- 前端顯示用名稱
  threads_user_id text not null,             -- Threads 數字 user id
  -- 憑證以 APP_ENCRYPTION_KEY 加密後存放，前端永不回傳
  access_token_enc text,
  token_expires_at timestamptz,              -- 長期 token 到期日（用來自動展期）
  client_secret_enc text,
  status text not null default 'active',     -- active | paused | error
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Shopee 分潤帳號（可與 Threads 帳號多對多搭配）──────────────
create table if not exists shopee_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  label text not null,
  app_id text not null,
  secret_enc text not null,
  default_sub_id text not null default 'threadspo',
  created_at timestamptz not null default now()
);

-- ── 監看來源：要爬的 Threads 帳號 ────────────────────────────
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  -- 產出要發到哪個 Threads 帳號 / 用哪個 Shopee 分潤帳號
  threads_account_id uuid references threads_accounts (id) on delete cascade,
  shopee_account_id uuid references shopee_accounts (id) on delete set null,
  source_username text not null,             -- 被監看的 Threads 帳號
  enabled boolean not null default true,
  poll_interval_minutes int not null default 15,
  auto_publish boolean not null default false, -- false = 進審核佇列；true = 全自動發
  posts_limit int not null default 1,
  last_polled_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── 發文去重（取代 n8n 的 processed_posts 表）─────────────────
create table if not exists processed_posts (
  id bigserial primary key,
  source_id uuid references sources (id) on delete cascade,
  post_id text not null,
  processed_at timestamptz not null default now(),
  unique (source_id, post_id)
);
create index if not exists idx_processed_posts_lookup on processed_posts (source_id, post_id);

-- ── AI 草稿 / 發文佇列 ───────────────────────────────────────
-- status: draft(AI已生成,待審) → approved → publishing → published / failed / rejected
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  source_id uuid references sources (id) on delete set null,
  threads_account_id uuid references threads_accounts (id) on delete set null,

  source_post_id text,                       -- 來源貼文 id
  product_name text,
  clean_product_url text,
  shopee_short_link text,                    -- 換成自己 subId 的分潤短連結

  media_type text,                           -- image | video | none
  source_media_url text,                     -- 原始媒體
  cloudinary_media_url text,                 -- 中轉後媒體

  main_text text,                            -- AI 正文
  reply_text text,                           -- AI 留言區（含分潤連結）
  ai_raw text,                               -- AI 原始輸出（備查）

  status text not null default 'draft',
  scheduled_at timestamptz,                  -- 排定發布時間（null = 立即/手動）
  published_post_id text,                    -- 發成功後的 Threads post id
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_drafts_status on drafts (status, scheduled_at);

-- ── 簡易成效紀錄（之後接 Shopee 報表 / Threads insights）────────
create table if not exists metrics (
  id bigserial primary key,
  draft_id uuid references drafts (id) on delete cascade,
  metric text not null,                      -- views | clicks | conversions
  value numeric not null default 0,
  recorded_at timestamptz not null default now()
);

-- updated_at 自動更新
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_threads_accounts_updated on threads_accounts;
create trigger trg_threads_accounts_updated before update on threads_accounts
  for each row execute function set_updated_at();

drop trigger if exists trg_drafts_updated on drafts;
create trigger trg_drafts_updated before update on drafts
  for each row execute function set_updated_at();

-- ── Row Level Security：每個使用者只能看自己的資料 ──────────────
-- processed_posts / metrics 僅後端 service-role 使用：啟用 RLS 但不建 policy，
-- 即可完全阻斷 anon key 存取，且不影響後端（service role 繞過 RLS）。
alter table profiles enable row level security;
alter table threads_accounts enable row level security;
alter table shopee_accounts enable row level security;
alter table sources enable row level security;
alter table drafts enable row level security;
alter table processed_posts enable row level security;
alter table metrics enable row level security;

create policy "own_profiles" on profiles
  using (id = auth.uid()) with check (id = auth.uid());
create policy "own_threads_accounts" on threads_accounts
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own_shopee_accounts" on shopee_accounts
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own_sources" on sources
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own_drafts" on drafts
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
