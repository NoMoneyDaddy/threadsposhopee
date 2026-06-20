-- 個人通知多通道：除 Telegram 外，可另綁 Discord webhook URL（POST {content}）。
-- URL 為使用者提供，伺服器端發送前一律過 SSRF 守衛（assertSafePublicUrl）。
alter table profiles add column if not exists discord_webhook_url text;
