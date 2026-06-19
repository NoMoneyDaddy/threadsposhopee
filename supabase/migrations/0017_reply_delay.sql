-- 延遲留言（串文 2/2 分潤連結）：主文發出後隔一段（保底 + 隨機抖動）才補留言，避免固定行為被偵測。
-- reply_status: none（無留言或已隨主文一起發）｜pending（主文已發、留言待補）｜published｜failed
alter table drafts add column if not exists reply_status text not null default 'none';
alter table drafts add column if not exists reply_due_at timestamptz;       -- 留言預計補發時間
alter table drafts add column if not exists reply_post_id text;             -- 留言貼文 id
alter table drafts add column if not exists reply_delay_minutes integer;    -- 逐則覆寫的延遲（分）；null = 用全域預設

-- 補留言 worker 撈「到期待補」的索引
create index if not exists drafts_reply_pending_idx on drafts (reply_due_at)
  where reply_status = 'pending';
