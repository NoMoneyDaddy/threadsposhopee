-- Phase 2：資料隔離。讓使用者以登入身分（session client）寫入時，owner_id 自動帶入 auth.uid()，
-- 搭配既有 RLS 政策（owner_id = auth.uid()）達成「每人只看/改自己的資料」。
-- 背景排程（service-role）會明確指定 owner_id = owner 的 user id。
alter table threads_accounts alter column owner_id set default auth.uid();
alter table shopee_accounts  alter column owner_id set default auth.uid();
alter table sources          alter column owner_id set default auth.uid();
alter table drafts           alter column owner_id set default auth.uid();
alter table materials        alter column owner_id set default auth.uid();

-- materials 之前的 RLS 政策已建立；確保 drafts/sources 等的 select/insert 政策齊全（已於 0001 建立）。
