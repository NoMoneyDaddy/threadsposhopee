// 應用層共用型別（對應 supabase/migrations/0001_init.sql）

export interface ThreadsAccount {
  id: string;
  label: string; // 使用者可自訂的暱稱（預設帶入 username）
  threads_user_id: string;
  display_name?: string | null; // Threads 上的顯示名稱
  avatar_url?: string | null; // Threads 個人頭像
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
  owner_id?: string | null; // 來源歸屬使用者（多租戶過濾＋用對的 Apify 金鑰）
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
  product_name?: string | null; // 乾淨核心品名（給文案/卡片標題）
  product_name_raw?: string | null; // 原始蝦皮標題（留存，可能含 SEO 關鍵字）
  clean_product_url?: string | null;
  commission_rate?: string | null; // 目前分潤率字串小數（0.05＝5%），顯示用
  commission_checked_at?: string | null; // 分潤率查詢時間
  affiliate_short_link?: string | null;
  affiliate_sub_id?: string | null;
  affiliate_generated_at?: string | null;
  affiliate_valid: boolean;
  affiliate_checked_at?: string | null;
  media_type?: "image" | "video" | "none" | null;
  source_media_url?: string | null;
  cloudinary_media_url?: string | null;
  // 多媒體（同一篇貼文的影片＋圖）：空陣列時退回上面單一 media 欄位（向後相容）。
  media?: DraftMedia[];
  main_text?: string | null;
  reply_text?: string | null;
  ai_raw?: string | null;
  ai_generated_at?: string | null;
  evergreen?: boolean | null; // 常青回收：定期自動重排成待審草稿
  evergreen_last_at?: string | null; // 上次常青重排時間（算「到期」用）
  shared?: boolean | null; // 是否分享進公共共享庫
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

// 串文段落（主文之後依序補發的一則）：文字＋可選媒體。
export interface ThreadSegment {
  text: string | null;
  media?: DraftMedia[];
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
  commission_rate?: string | null; // 建立時自素材快照的分潤率（顯示用）
  commission_checked_at?: string | null;
  media_type?: "image" | "video" | "none" | null;
  source_media_url?: string | null;
  cloudinary_media_url?: string | null;
  // 多媒體（輪播）：人工拖拉上傳/排序後存這裡；空陣列時退回上面單一 media 欄位（向後相容）。
  // DB 為 jsonb NOT NULL default '[]'，讀取一律是陣列，故型別不含 null。
  media?: DraftMedia[];
  // 留言（串文 2/2）要帶的媒體（通常 1 張圖）。空陣列＝純文字留言。
  reply_media?: DraftMedia[];
  // 多段串文（3 則以上）：主文之後要依序補發的段落鏈。空＝沿用上面單則 reply_*（向後相容）。
  thread_chain?: ThreadSegment[];
  // 下一個要補發的段落索引（0-based）；上一段成功發出的貼文 id（下一段 reply_to 對象）。
  thread_cursor?: number | null;
  thread_last_post_id?: string | null;
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

// 意見回饋／工單（對應 0051_feedback.sql）：使用者送 bug/功能建議，管理員前端回覆。
export type FeedbackKind = "bug" | "feature";
export type FeedbackStatus = "open" | "in_progress" | "resolved" | "closed";
export interface Feedback {
  id: string;
  owner_id: string;
  kind: FeedbackKind;
  title: string;
  message: string;
  status: FeedbackStatus;
  admin_reply?: string | null;
  replied_at?: string | null;
  created_at: string;
  updated_at?: string | null;
}
