-- 防止「加入佇列」在高併發下兩篇排到同一帳號同一時段（Qodo 審查）。
-- 僅約束「待發（approved）且有排定時間」的草稿；發布後 status 改變即離開索引、釋放該格。
create unique index if not exists uniq_drafts_account_slot
  on drafts (threads_account_id, scheduled_at)
  where status = 'approved' and scheduled_at is not null;
