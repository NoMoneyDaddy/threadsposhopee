-- Phase 1「使用者自訂廣告跳轉頁」：每位使用者可設一個廣告頁 URL，訪客點自己短連結的中轉頁「繼續」時，
-- 於新分頁開啟該廣告頁（drrop/myppt 模式：點擊在新分頁開廣告、可直接關），使用者用自己的廣告頁變現。
-- 存 profiles 單欄（純 URL，非機密，不加密）；讀寫皆過 SSRF/協定守衛。
alter table profiles add column if not exists redirect_ad_url text;
