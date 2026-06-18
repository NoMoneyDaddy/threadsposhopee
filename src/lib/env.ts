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

  cronSecret: process.env.CRON_SECRET ?? "",

  // 發文流程的防封設定（保守預設，可用環境變數覆寫）
  // 注意：用 parseInt(x || 預設) 而非 Number()，避免空字串被解析成 0 導致防封失效
  publishMinGapMinutes: parseInt(process.env.PUBLISH_MIN_GAP_MINUTES || "240", 10), // 每帳號每篇至少間隔（分）
  publishMaxPerDay: parseInt(process.env.PUBLISH_MAX_PER_DAY || "5", 10), // 每帳號每 24h 上限（遠低於 Threads 250）
  publishBatchPerRun: parseInt(process.env.PUBLISH_BATCH_PER_RUN || "1", 10), // 每次 cron 每帳號最多發幾篇
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? ""
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const isDemoMode = !isSupabaseConfigured;
