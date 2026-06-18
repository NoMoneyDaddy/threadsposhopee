-- Threads OAuth：一個使用者對同一個 Threads 帳號只保留一筆，供 upsert(onConflict) 使用。
-- 若既有資料有重複，先清掉舊的（保留最新一筆）再建唯一索引。
delete from threads_accounts a
using threads_accounts b
where a.owner_id = b.owner_id
  and a.threads_user_id = b.threads_user_id
  and a.created_at < b.created_at;

create unique index if not exists threads_accounts_owner_user_uniq
  on threads_accounts (owner_id, threads_user_id);
