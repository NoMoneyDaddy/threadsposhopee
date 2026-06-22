-- 每位使用者自綁完整 Cloudinary API 金鑰（供「用量面板」查詢，需 admin 等級金鑰）。
-- 與既有 cloudinary_cloud / cloudinary_preset（上傳用，非機密）分開：API key/secret 為機密，AES-256-GCM 加密存。
alter table profiles add column if not exists cloudinary_api_key_enc text;
alter table profiles add column if not exists cloudinary_api_secret_enc text;
