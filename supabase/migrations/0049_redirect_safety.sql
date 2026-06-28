-- go2read 轉址服務：來源網址安全掃描結果（Google Safe Browsing）。
-- safety：'safe'｜'unsafe'｜null（未掃描／未設金鑰／查詢失敗＝unknown，中轉頁降級為基本檢查）。
-- safety_checked_at：掃描時間（顯示與重掃判斷用）。
alter table redirect_links add column if not exists safety text;
alter table redirect_links add column if not exists safety_checked_at timestamptz;

do $$ begin
  alter table redirect_links add constraint redirect_links_safety_chk check (safety in ('safe', 'unsafe'));
exception when duplicate_object then null; end $$;
