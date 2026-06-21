-- 每位使用者的通知個別開關（JSON：{ type: boolean }）。預設 NULL＝全開（由應用層 normalize）。
alter table profiles add column if not exists notify_prefs jsonb;
