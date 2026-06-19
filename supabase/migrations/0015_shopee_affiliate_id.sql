-- 無 Open API 的分潤追蹤：存使用者的 shopee affiliate_id，
-- 用官方 an_redir 做法自組追蹤連結（免申請 API 金鑰）。非機密，明文。
alter table profiles add column if not exists shopee_affiliate_id text;
