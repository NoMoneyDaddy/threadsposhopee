-- 各使用者自綁的 Cloudflare R2 圖床（S3 相容）：與 Cloudinary 二擇一。
-- access key / secret 為機密 → AES-256-GCM 加密存（_enc）；account_id/bucket/public_base 非機密，明文。
-- 公開讀網址（public_base，如 https://media.example.com 或 https://<id>.r2.dev）用於回傳投放 URL。
alter table profiles add column if not exists r2_account_id text;
alter table profiles add column if not exists r2_access_key_id_enc text;
alter table profiles add column if not exists r2_secret_enc text;
alter table profiles add column if not exists r2_bucket text;
alter table profiles add column if not exists r2_public_base text;
