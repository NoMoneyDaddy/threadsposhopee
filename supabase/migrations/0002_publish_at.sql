-- 發文流程：記錄實際發布時間，用於防封節奏控制（間隔、每日上限）
alter table drafts add column if not exists published_at timestamptz;
create index if not exists idx_drafts_publish_pacing on drafts (threads_account_id, status, published_at);
