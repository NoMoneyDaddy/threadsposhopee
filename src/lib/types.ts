// 應用層共用型別（對應 supabase/migrations/0001_init.sql）

export interface ThreadsAccount {
  id: string;
  label: string;
  threads_user_id: string;
  token_expires_at?: string | null;
  status: "active" | "paused" | "error";
}

export interface ShopeeAccount {
  id: string;
  label: string;
  app_id: string;
  default_sub_id: string;
}

export interface Source {
  id: string;
  threads_account_id: string;
  shopee_account_id?: string | null;
  source_username: string;
  enabled: boolean;
  poll_interval_minutes: number;
  auto_publish: boolean;
  posts_limit: number;
  last_polled_at?: string | null;
}

// 素材庫：以商品為鍵，綁定分潤連結＋AI 文案＋媒體，供重用/重發
export interface Material {
  id: string;
  owner_id?: string | null;
  shop_id: string;
  item_id: string;
  product_name?: string | null;
  clean_product_url?: string | null;
  affiliate_short_link?: string | null;
  affiliate_sub_id?: string | null;
  affiliate_generated_at?: string | null;
  affiliate_valid: boolean;
  media_type?: "image" | "video" | "none" | null;
  source_media_url?: string | null;
  cloudinary_media_url?: string | null;
  main_text?: string | null;
  reply_text?: string | null;
  ai_raw?: string | null;
  ai_generated_at?: string | null;
  created_at: string;
}

export type DraftStatus =
  | "draft"
  | "approved"
  | "publishing"
  | "published"
  | "failed"
  | "rejected";

export interface Draft {
  id: string;
  owner_id?: string | null;
  material_id?: string | null;
  source_id?: string | null;
  threads_account_id?: string | null;
  source_post_id?: string | null;
  product_name?: string | null;
  clean_product_url?: string | null;
  shopee_short_link?: string | null;
  media_type?: "image" | "video" | "none" | null;
  source_media_url?: string | null;
  cloudinary_media_url?: string | null;
  main_text?: string | null;
  reply_text?: string | null;
  ai_raw?: string | null;
  status: DraftStatus;
  scheduled_at?: string | null;
  published_post_id?: string | null;
  published_at?: string | null;
  error?: string | null;
  created_at: string;
}
