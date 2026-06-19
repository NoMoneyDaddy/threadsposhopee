-- 爬蟲子系統：Apify 憑證改為「每個使用者自己綁」（owner 用），不再只靠全域 env。
-- token 以 APP_ENCRYPTION_KEY 加密存放；actor 為要跑的 Apify actor id。
alter table profiles add column if not exists apify_token_enc text;
alter table profiles add column if not exists apify_actor text;
