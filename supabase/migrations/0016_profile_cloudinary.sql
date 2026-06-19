-- 各使用者自綁 Cloudinary：素材中轉進自己的雲端帳號，而非共用 owner 的。
-- cloud name 與 unsigned upload preset 皆非機密（preset 本就設計給前端公開使用），故明文存。
alter table profiles add column if not exists cloudinary_cloud text;
alter table profiles add column if not exists cloudinary_preset text;
