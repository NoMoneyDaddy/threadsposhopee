-- 常青內容回收：把賺錢的素材標為「常青」，由排程定期自動重排成「待審草稿」（仍人工核准），
-- 重用既有連結/文案/媒體、不重燒 AI token。evergreen_last_at 記錄上次重排時間，用來算「到期」。
alter table materials add column if not exists evergreen boolean not null default false;
alter table materials add column if not exists evergreen_last_at timestamptz;
-- 加速「找出到期的常青素材」查詢（僅索引常青列）。
create index if not exists idx_materials_evergreen_due
  on materials (evergreen_last_at)
  where evergreen = true;
