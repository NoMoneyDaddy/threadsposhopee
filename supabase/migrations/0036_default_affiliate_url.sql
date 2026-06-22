-- 使用者「預設分潤連結」：AI 代理人發文走 go2read 中轉時，「繼續」要去的分潤連結預設值，
-- 免得每篇都要設定。非機密、明文存。建議填蝦皮直營商城或自己的分潤連結。
alter table profiles add column if not exists default_affiliate_url text;
