-- Threads 發文帳號顯示資訊：頭像與顯示名稱（連結授權時自 Threads 個人檔案抓取）。
-- label 維持為「使用者可自訂的暱稱」（預設帶入 username）；display_name 為 Threads 上的真實名稱。
alter table threads_accounts add column if not exists avatar_url text;
alter table threads_accounts add column if not exists display_name text;
