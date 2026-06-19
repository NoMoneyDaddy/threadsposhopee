-- 系統狀態 key-value（目前用於排程心跳，給儀表板顯示「自動駕駛運轉中」）。
-- 僅後端 service-role 寫入；啟用 RLS 無 policy 即阻斷 anon 存取。
create table if not exists app_state (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;
