-- 共享素材庫：使用者可把自己的素材設為「分享」進公共池，別人可匯入（用自己的蝦皮金鑰重產分潤連結，
-- 分潤算匯入者自己；不外露分享者的分潤連結）。import_count 記被匯入次數＝貢獻分數，用於贊助文配額減免。
alter table materials add column if not exists shared boolean not null default false;
alter table materials add column if not exists import_count integer not null default 0;
-- 加速公共池瀏覽（僅索引已分享、仍有效者）。
create index if not exists idx_materials_shared
  on materials (created_at desc)
  where shared = true and affiliate_valid = true;
