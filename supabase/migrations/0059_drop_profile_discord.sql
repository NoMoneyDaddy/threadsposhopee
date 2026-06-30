-- 移除 Discord 通知功能：應用層程式碼早已不再使用 discord_webhook_url（無任何讀寫），
-- 清掉這個殘留欄位（正式庫該欄全為 NULL，無資料遺失）。drop column if exists 冪等、可安全重跑。
alter table profiles drop column if exists discord_webhook_url;
