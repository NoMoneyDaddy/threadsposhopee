-- 每位使用者自訂發文節奏（取代只用全站 env 預設）：留空/NULL 則沿用 env 預設。
-- slots：逗號分隔 HH:MM（Asia/Taipei）；min_gap：每帳號最小間隔（分）；max_per_day：每帳號每日上限。
alter table profiles add column if not exists publish_slots text;
alter table profiles add column if not exists publish_min_gap_minutes integer;
alter table profiles add column if not exists publish_max_per_day integer;
