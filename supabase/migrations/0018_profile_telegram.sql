-- 個人 Telegram 通知：每個使用者綁自己的 Telegram chat_id，接收屬於自己的提醒
-- （如「你的貼文可能已發出待確認」）。用平台共用 bot token（env）發送；chat_id 非機密，明文存。
alter table profiles add column if not exists telegram_chat_id text;
