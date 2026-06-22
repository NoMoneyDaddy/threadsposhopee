-- Link-in-bio：每位使用者一個公開 bio 頁（/b/<handle>），列出他選入 bio 的 go2read 短連結。
-- handle 為公開代稱（小寫唯一）；redirect_links.in_bio 決定哪些連結顯示在 bio 頁。
alter table profiles add column if not exists bio_handle text;
alter table profiles add column if not exists bio_title text;
-- handle 大小寫不敏感唯一（僅對已設定者）。
create unique index if not exists idx_profiles_bio_handle on profiles (lower(bio_handle)) where bio_handle is not null;

alter table redirect_links add column if not exists in_bio boolean not null default false;
