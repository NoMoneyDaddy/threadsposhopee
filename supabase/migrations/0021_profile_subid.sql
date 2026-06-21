-- 使用者自訂分潤 subId：套用到「API 轉換短連結」與「an_redir 長連結」兩種分潤連結。
-- 非機密，明文存。符合蝦皮規範（英數與底線、長度上限）由應用層 normalizeSubId 把關。
alter table profiles add column if not exists shopee_sub_id text;
