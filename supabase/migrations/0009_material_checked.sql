-- 連結健檢時間：記錄每個素材分潤連結上次檢查時間（健檢 cron 用，先檢最久沒查的）。
alter table materials add column if not exists affiliate_checked_at timestamptz;
create index if not exists idx_materials_checked on materials (affiliate_checked_at nulls first);
