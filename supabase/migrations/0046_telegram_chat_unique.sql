-- Telegram 遠端審核：同一 Telegram chat 至多綁定一位使用者，避免 webhook 以 chat 反查 owner 時錯配。
-- 部分唯一索引（忽略 NULL，未綁定者不受限）。
create unique index if not exists uq_profiles_telegram_chat_id
  on profiles (telegram_chat_id)
  where telegram_chat_id is not null;
