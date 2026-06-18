-- 素材庫：以商品 (shop_id, item_id) 為鍵，綁定分潤連結＋AI 文案＋媒體，
-- 重用以省 AI token 與 Shopee API 呼叫；同一素材可重複產生草稿（重發）。
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  shop_id text not null,
  item_id text not null,
  product_name text,
  clean_product_url text,

  -- 分潤連結（綁定、重用，除非失效才重產）
  affiliate_short_link text,
  affiliate_sub_id text,
  affiliate_generated_at timestamptz,
  affiliate_valid boolean not null default true,

  -- 媒體（中轉後穩定 URL）
  media_type text,
  source_media_url text,
  cloudinary_media_url text,

  -- AI 文案（綁定、重用；可人工或 AI 重新生成覆寫）
  main_text text,
  reply_text text,
  ai_raw text,
  ai_generated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, item_id)
);

create index if not exists idx_materials_lookup on materials (shop_id, item_id);

drop trigger if exists trg_materials_updated on materials;
create trigger trg_materials_updated before update on materials
  for each row execute function set_updated_at();

-- 草稿關聯到素材（可重發、可回溯）
alter table drafts add column if not exists material_id uuid references materials (id) on delete set null;

alter table materials enable row level security;
create policy "own_materials" on materials
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
