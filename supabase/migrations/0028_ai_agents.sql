-- AI 代理人發文：人格×領域，定時抓來源→改寫→建草稿（待審）。
-- 來源去重記錄存 ai_agent_seen；drafts 加 source_agent_id 標記由哪個 agent 產生。
create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  tone text not null default '',
  domain text not null default 'tech',
  emoji_level text not null default 'light',
  hashtag_pool text[] not null default '{}',
  length int not null default 200,
  source_mode text not null default 'rss',   -- 'rss' | 'ai_search'（ai_search 後續）
  rss_feeds text[] not null default '{}',     -- 空則用領域預設 Google News RSS
  search_query text not null default '',
  threads_account_id uuid references threads_accounts(id) on delete set null,
  use_redirect boolean not null default false, -- 來源連結是否走 go2read 短連結
  enabled boolean not null default false,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ai_agents_owner_idx on ai_agents(owner_id);

create table if not exists ai_agent_seen (
  agent_id uuid not null references ai_agents(id) on delete cascade,
  source_hash text not null,
  title text,
  created_at timestamptz not null default now(),
  primary key (agent_id, source_hash)
);
create index if not exists ai_agent_seen_created_idx on ai_agent_seen(created_at);

alter table drafts add column if not exists source_agent_id uuid references ai_agents(id) on delete set null;
