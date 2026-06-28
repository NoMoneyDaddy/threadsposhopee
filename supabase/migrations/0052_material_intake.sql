-- 爬蟲產出的素材改為「先待審」：人工逐筆核准才正式進素材庫（可被排程/發文/列表使用）。
-- 手動建立、共享匯入的素材維持預設「已核准」（使用者自己做的，不需再審）。
-- 既有資料：add column 預設 'approved' 會回填，不影響舊素材。
alter table materials add column if not exists intake_status text not null default 'approved'
  check (intake_status in ('pending', 'approved'));

-- 待審清單查詢用（依 owner＋狀態）。
create index if not exists materials_intake_idx on materials(owner_id, intake_status);
