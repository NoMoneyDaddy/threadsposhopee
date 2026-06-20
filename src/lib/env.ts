// 集中讀取環境變數，並判斷是否進入 Demo 模式（缺金鑰時用 fixtures 跑）。
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? "",

  apifyToken: process.env.APIFY_TOKEN ?? "",
  apifyActor: process.env.APIFY_THREADS_ACTOR ?? "igview-owner/threads-scraper-lite",

  shopeeAppId: process.env.SHOPEE_AFFILIATE_APP_ID ?? "",
  shopeeSecret: process.env.SHOPEE_AFFILIATE_SECRET ?? "",
  shopeeDefaultSubId: process.env.SHOPEE_DEFAULT_SUB_ID ?? "threadspo",

  aiProvider: (process.env.AI_PROVIDER ?? "gemini") as "gemini" | "anthropic",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",

  cloudinaryCloud: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryPreset: process.env.CLOUDINARY_UPLOAD_PRESET ?? "threads_media",
  // 選填：填了才能在儀表板顯示 Cloudinary 用量
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",

  cronSecret: process.env.CRON_SECRET ?? "",

  // Threads OAuth（一鍵連發文帳號，取代手貼 token）
  threadsAppId: process.env.THREADS_APP_ID ?? "",
  threadsAppSecret: process.env.THREADS_APP_SECRET ?? "",
  threadsRedirectUri: process.env.THREADS_REDIRECT_URI ?? "",

  // owner（管理者）email：只有此帳號能用爬蟲 + 你的 Shopee 分潤金鑰；其他人是 member
  ownerEmail: (process.env.OWNER_EMAIL ?? "").toLowerCase(),

  // 發文流程的防封設定（保守預設，可用環境變數覆寫）
  // 注意：用 parseInt(x || 預設) 而非 Number()，避免空字串被解析成 0 導致防封失效
  publishMinGapMinutes: parseInt(process.env.PUBLISH_MIN_GAP_MINUTES || "240", 10), // 每帳號每篇「保底」最小間隔（分）
  publishGapJitterMinutes: parseInt(process.env.PUBLISH_GAP_JITTER_MINUTES || "0", 10), // 保底之上的隨機抖動上限（分），防固定節奏
  publishMaxPerDay: parseInt(process.env.PUBLISH_MAX_PER_DAY || "5", 10), // 每帳號每 24h 上限（遠低於 Threads 250）
  publishBatchPerRun: parseInt(process.env.PUBLISH_BATCH_PER_RUN || "1", 10), // 每次 cron 每帳號最多發幾篇
  // 商品冷卻期（小時）：同一分潤商品在此時間內已（跨任一帳號）發過就先不發，防同品狂洗。
  // 0 = 關閉（向後相容）。發文佇列自動跳過、待冷卻過後下輪再發。
  productCooldownHours: parseInt(process.env.PRODUCT_COOLDOWN_HOURS || "0", 10),
  // 新帳號暖機天數：帳號建立後前 N 天，每日發文上限自 1 線性遞增到 PUBLISH_MAX_PER_DAY，
  // 降低新號被封風險。0 = 關閉（向後相容）。
  accountWarmupDays: parseInt(process.env.ACCOUNT_WARMUP_DAYS || "0", 10),
  // 帳號連續失敗斷路器：單輪同帳號發文失敗數達此上限，即跳過該帳號其餘草稿（避免對
  // 壞掉/被封帳號連續打 API 升高風險），下輪自動重置。0 = 關閉（向後相容）。
  publishAccountFailureLimit: parseInt(process.env.PUBLISH_ACCOUNT_FAILURE_LIMIT || "0", 10),
  // 斷路器跨輪冷卻（分鐘）：帳號觸發斷路器後，冷卻期內「跨 cron 輪次」整批跳過，
  // 不每輪重新試探壞帳號；發文成功則解除。0 = 只在單輪內生效（向後相容）。
  publishCircuitCooldownMinutes: parseInt(process.env.PUBLISH_CIRCUIT_COOLDOWN_MINUTES || "0", 10),
  // 留言（串文 2/2 分潤連結）延遲：主文發出後隔多久才補留言，避免「秒留言」固定行為被偵測。
  // 0 = 立即（向後相容）。逐則可用 draft.reply_delay_minutes 覆寫。
  replyDelayFloorMinutes: parseInt(process.env.REPLY_DELAY_MIN_MINUTES || "0", 10), // 留言延遲「保底」分鐘
  replyDelayJitterMinutes: parseInt(process.env.REPLY_DELAY_JITTER_MINUTES || "0", 10), // 保底之上的隨機抖動上限（分）
  // 「加入佇列」用的每日發文時段（Asia/Taipei，HH:MM，逗號分隔）
  publishSlots: (process.env.PUBLISH_SLOTS || "09:00,12:30,20:00")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s)),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? ""
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const isDemoMode = !isSupabaseConfigured;
