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
  affiliate_checked_at?: string | null;
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
  | "needs_verification" // 發布步驟回應遺失/中斷，可能已發出 → 需人工到 Threads 確認，不自動重發
  | "rejected";

export interface DraftMedia {
  url: string;
  type: "image" | "video";
}

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
  // 多媒體（輪播）：人工拖拉上傳/排序後存這裡；空陣列時退回上面單一 media 欄位（向後相容）。
  // DB 為 jsonb NOT NULL default '[]'，讀取一律是陣列，故型別不含 null。
  media?: DraftMedia[];
  main_text?: string | null;
  reply_text?: string | null;
  ai_raw?: string | null;
  status: DraftStatus;
  scheduled_at?: string | null;
  published_post_id?: string | null;
  published_at?: string | null;
  error?: string | null;
  // 延遲留言（串文 2/2）：主文發出後隔一段才補留言
  reply_status?: "none" | "pending" | "publishing-reply" | "published" | "failed" | null;
  reply_due_at?: string | null;
  reply_post_id?: string | null;
  reply_delay_minutes?: number | null; // 逐則覆寫；null = 用全域預設
  created_at: string;
}
