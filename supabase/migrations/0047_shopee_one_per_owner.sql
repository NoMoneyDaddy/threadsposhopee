-- Shopee 分潤帳號改為「每位使用者僅一組」。
-- 1) 去重：每位 owner 僅保留 created_at 最舊那筆（與 getShopeeCredentials 的讀取規則一致），其餘刪除。
--    註：sources.shopee_account_id 為 on delete set null，且該欄目前不參與憑證解析
--    （getShopeeCredentials 以 owner 取最舊一筆），故清理既有重複列的影響可忽略。
delete from shopee_accounts a
using shopee_accounts b
where a.owner_id = b.owner_id
  and a.owner_id is not null
  and (b.created_at < a.created_at or (b.created_at = a.created_at and b.id < a.id));

-- 2) owner_id 唯一：保證一人一組，並讓 createShopeeAccount 的 upsert(onConflict: owner_id) 可用。
create unique index if not exists shopee_accounts_owner_id_key on shopee_accounts (owner_id);
