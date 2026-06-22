-- 監看來源支援關鍵字搜尋模式（搭配 threads-search-scraper）：
-- search_query 有值＝以關鍵字搜尋貼文；無值＝沿用 source_username 監看單一帳號。
alter table sources add column if not exists search_query text;
