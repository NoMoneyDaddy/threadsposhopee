-- AI 子系統：Gemini API key 改為「每個使用者自己綁」（加密存放），不再只靠全域 env。
alter table profiles add column if not exists gemini_api_key_enc text;
