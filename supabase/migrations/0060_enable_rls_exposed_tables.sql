-- 安全修補（Supabase advisor: rls_disabled_in_public，ERROR）：
-- 這幾張表暴露於 PostgREST 卻未開 RLS → 任何人拿公開 anon key 即可直接讀寫。
-- 本專案資料層一律走 service-role（繞過 RLS），go2read 點擊計數走 SECURITY DEFINER 函式（亦繞過 RLS），
-- 故「開 RLS、不建 policy」＝對 anon/authenticated 全部拒絕（deny-all），擋掉漏洞且不影響 App
-- （與既有 app_state／metrics／processed_posts／scrape_runs 同模式）。enable RLS 對已啟用者為 no-op，冪等可重跑。
alter table material_favorites enable row level security;
alter table ai_agents enable row level security;
alter table ai_agent_seen enable row level security;
alter table redirect_links enable row level security;
alter table push_subscriptions enable row level security;
