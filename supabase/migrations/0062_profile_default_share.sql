-- 新素材是否「預設分享到共享庫」（各人各設）。預設 true（開）：之後新增/入庫的素材自動分享
-- （只分享商品名/圖/文案/原始連結，不含分潤連結）。使用者可在設定關閉此預設。
-- 既有素材不受影響（此欄僅在建立/入庫當下作為預設值讀取）。冪等可重跑。
alter table profiles add column if not exists default_share_materials boolean not null default true;
