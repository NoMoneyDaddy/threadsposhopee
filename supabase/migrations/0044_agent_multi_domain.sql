-- AI 小編可橫跨多個領域：新增 domains 陣列（為空時沿用單一 domain 欄位，向後相容）。
-- 既有資料的 domain 仍保留作為「主領域」（顯示與相容用）；domains 為實際抓取/產文依據。
alter table ai_agents add column if not exists domains text[] not null default '{}';
