-- 商品名原始/乾淨拆分 + 目前分潤率（顯示用）：
-- product_name 改存「乾淨核心品名」（給文案/卡片標題），product_name_raw 留原始蝦皮標題。
-- commission_rate 為字串小數（如 0.05＝5%），隨時間變動，commission_checked_at 記查詢時間。
alter table materials add column if not exists product_name_raw text;
alter table materials add column if not exists commission_rate text;
alter table materials add column if not exists commission_checked_at timestamptz;

-- 草稿快照分潤率（顯示用；建立時自素材複製）。
alter table drafts add column if not exists commission_rate text;
alter table drafts add column if not exists commission_checked_at timestamptz;
