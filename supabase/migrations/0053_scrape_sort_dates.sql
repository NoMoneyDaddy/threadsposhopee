-- 抓文設定新增「排序」與「日期區間」參數（對齊 Threads Search Scraper actor 的 sort／after／before）。
-- 以關鍵字來源列承載抓文設定，故加在 sources 上；全為選填、舊資料留 null（＝沿用預設 recent、不限日期）。
-- 冪等：add column if not exists 可重跑。
alter table sources add column if not exists sort text;
alter table sources add column if not exists after_date text;
alter table sources add column if not exists before_date text;

-- sort 只允許 top／recent（null 視為未設＝預設 recent，不在 CHECK 內擋 null）。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sources_sort_check' and conrelid = 'sources'::regclass
  ) then
    alter table sources add constraint sources_sort_check check (sort is null or sort in ('top', 'recent'));
  end if;
end
$$;
