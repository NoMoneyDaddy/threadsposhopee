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
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? ""
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseServiceKey);
export const isDemoMode = !isSupabaseConfigured;
