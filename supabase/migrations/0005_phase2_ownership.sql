-- Phase 2：多租戶資料隔離。
-- 素材唯一鍵改成 per-owner（不同使用者可各自擁有同一商品的素材）。
alter table materials drop constraint if exists materials_shop_id_item_id_key;
create unique index if not exists materials_owner_shop_item_key on materials (owner_id, shop_id, item_id);

-- 既有資料回填：把本專案早期（單租戶階段）owner_id 為 null 的資料指派給 owner。
-- 新環境不會有 null（owner_id 已有 default auth.uid()），此區塊為無害的 no-op。
-- 註：請將下方 UUID 換成你的 owner 在 auth.users 的 id。
do $$
declare owner_uid uuid := 'eb36e483-4657-4801-8e22-6a7a024a1bfc';
begin
  update threads_accounts set owner_id = owner_uid where owner_id is null;
  update shopee_accounts  set owner_id = owner_uid where owner_id is null;
  update sources          set owner_id = owner_uid where owner_id is null;
  update drafts           set owner_id = owner_uid where owner_id is null;
  update materials        set owner_id = owner_uid where owner_id is null;
end $$;
