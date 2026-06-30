-- 每位使用者自訂「留言（串文 2/n 分潤連結）延遲」：保底分鐘＋隨機抖動上限。
-- NULL＝沿用系統預設（env REPLY_DELAY_MIN_MINUTES / REPLY_DELAY_JITTER_MINUTES）；0＝立即/無抖動。
alter table profiles add column if not exists publish_reply_delay_min int;
alter table profiles add column if not exists publish_reply_delay_jitter int;
