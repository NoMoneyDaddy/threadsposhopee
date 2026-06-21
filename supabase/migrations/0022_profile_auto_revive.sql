-- 連結失效時是否自動替換為有效分潤連結（用已存的商品原始連結 clean_product_url 重產）。
-- 預設關：失效只標記、不自動重產，交由使用者決定（避免無謂重燒 token）。
alter table profiles add column if not exists auto_revive_links boolean not null default false;
