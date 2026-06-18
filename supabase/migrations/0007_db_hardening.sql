-- 效能索引 + 冪等 + 擁有權硬化（SRE / 架構審查）。

-- 1) 熱查詢索引：儀表板統計、發文佇列、節奏判斷
create index if not exists idx_drafts_owner_status on drafts (owner_id, status);
create index if not exists idx_drafts_account_status_pub
  on drafts (threads_account_id, status, published_at desc);
-- 發文佇列挑「已核准且到期」的草稿
create index if not exists idx_drafts_status_scheduled on drafts (status, scheduled_at);
-- 去重查詢
create index if not exists idx_processed_posts_source_post on processed_posts (source_id, post_id);

-- 2) 冪等：同一個 Threads 貼文 id 不可重複寫入（防程序中斷後重發造成雙貼）
create unique index if not exists uniq_drafts_published_post_id
  on drafts (published_post_id) where published_post_id is not null;

-- 3) 擁有權硬化：owner_id 不可為 null（0004 已設預設、0005 已回填）
alter table threads_accounts alter column owner_id set not null;
alter table shopee_accounts  alter column owner_id set not null;
alter table sources          alter column owner_id set not null;
alter table drafts           alter column owner_id set not null;
alter table materials        alter column owner_id set not null;
