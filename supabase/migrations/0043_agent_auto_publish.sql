-- AI 小編：可選「免審直接排程」（預設關＝產出仍待人工核准）。
-- 開啟後，小編產出的貼文會自動排進下一個空時段並標記已核准，由發文佇列依防封節奏發出，不經人工審核。
alter table ai_agents add column if not exists auto_publish boolean not null default false;
