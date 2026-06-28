-- 意見回饋／工單：使用者送出 bug 回報或功能建議，管理員（owner）在前端回覆並更新狀態。
-- 多租戶：每筆綁 owner_id（送出者）；管理員以 owner email 判定，可讀寫全部（service-role 在應用層放行）。
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade, -- 送出者
  kind text not null default 'feature',   -- 'bug' | 'feature'
  title text not null,
  message text not null,
  status text not null default 'open',     -- 'open' | 'in_progress' | 'resolved' | 'closed'
  admin_reply text,                        -- 管理員前端回覆（明文）
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_owner_idx on feedback(owner_id);
create index if not exists feedback_status_idx on feedback(status);
create index if not exists feedback_created_idx on feedback(created_at desc);

drop trigger if exists trg_feedback_updated on feedback;
create trigger trg_feedback_updated before update on feedback
  for each row execute function set_updated_at();

-- RLS：使用者只能讀寫自己的工單；管理員的全域存取走 service-role（繞 RLS）＋應用層 isOwner 把關。
alter table feedback enable row level security;
do $$ begin
  create policy "own_feedback" on feedback
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());
exception when duplicate_object then null; end $$;
