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
  search_query?: string | null; // 有值＝關鍵字搜尋模式；無值＝監看 source_username 帳號
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
  evergreen?: boolean | null; // 常青回收：定期自動重排成待審草稿
  evergreen_last_at?: string | null; // 上次常青重排時間（算「到期」用）
  shared?: boolean | null; // 是否分享進公共素材池
  import_count?: number | null; // 被別人匯入的次數（貢獻分數）
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
  source_agent_id?: string | null; // 由哪個 AI 代理人產生（null=非代理人）
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
  // 留言（串文 2/2）要帶的媒體（通常 1 張圖）。空陣列＝純文字留言。
  reply_media?: DraftMedia[];
  // 發布版面：'split'（預設，null 同）＝主文媒體＋留言（含分潤連結＋reply_media）；
  // 'all_in_main'＝影片＋圖＋連結全發主文，不另發留言。
  post_mode?: "split" | "all_in_main" | null;
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
