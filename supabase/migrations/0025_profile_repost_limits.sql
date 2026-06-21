-- 每位使用者的「同素材重複發文上限」。0／NULL＝不限制（由應用層視為無上限）。
-- per_account：同一素材在「單一帳號」最多可排入／發布幾次；total：同一素材跨所有帳號合計上限。
alter table profiles add column if not exists repost_max_per_account int;
alter table profiles add column if not exists repost_max_total int;
