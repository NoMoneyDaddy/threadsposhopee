-- 非同步抓取（A+B）：記錄每個 Apify run 的狀態，供「即時進度」前端輪詢與背景 cron 完成後入庫。
-- 取代 run-sync 的 300s 硬上限：啟動後立刻拿 run_id，背景輪詢、完成才抓 dataset 入庫（關頁也跑完）。
create table if not exists scrape_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  source_id uuid,                 -- 對應的關鍵字來源（可空：來源被刪仍保留紀錄）
  apify_run_id text not null,     -- Apify run id（查狀態/log）
  dataset_id text,                -- 完成後抓結果用
  actor text not null,
  status text not null default 'running'
    check (status in ('running', 'ingesting', 'done', 'failed')),
  -- 抓取參數快照（keyword/after/before/force/postsLimit…）：完成入庫時用，避免依賴當下來源設定已變。
  params jsonb not null default '{}'::jsonb,
  keyword text,                   -- 顯示用（此 run 的關鍵字）
  item_count integer,             -- Apify 抓到的 dataset 筆數
  created_count integer,          -- 入庫後新增的素材數
  error text,                     -- 失敗原因（截斷）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- owner 最近的 run（前端列表／即時進度）。
create index if not exists scrape_runs_owner_idx on scrape_runs (owner_id, created_at desc);
-- 背景 cron 撈「未完成」的 run 來推進（跨 owner）。
create index if not exists scrape_runs_active_idx on scrape_runs (status) where status in ('running', 'ingesting');
