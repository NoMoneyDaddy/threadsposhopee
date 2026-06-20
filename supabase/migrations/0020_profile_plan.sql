-- 商業化基礎：使用者方案分層。以「可連結的 Threads 發文帳號數」為計費維度。
-- 只存方案字串（free/pro/business），實際限額由應用層 src/lib/plans.ts 查表得出，
-- 方便日後調整級距而不需資料遷移。預設 free。
alter table profiles add column if not exists plan text not null default 'free';
