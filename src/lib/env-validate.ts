// 啟動期環境檢查：只驗「已提供值」的格式與配對（不要求一定要設，Demo 模式可全空），
// 回傳警告字串陣列（啟動時 log，不中斷）。純函式可測。
export interface EnvLike {
  encryptionKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  aiProvider: string;
  cronSecret: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export function validateEnv(e: EnvLike, isProduction: boolean): string[] {
  const warnings: string[] = [];

  // AES-256-GCM 金鑰：須為 base64 的 32 bytes
  if (e.encryptionKey && Buffer.from(e.encryptionKey, "base64").length !== 32) {
    warnings.push("APP_ENCRYPTION_KEY 應為 base64 編碼的 32 bytes 金鑰（AES-256）");
  }

  // Web Push VAPID 公私鑰需成對
  if (Boolean(e.vapidPublicKey) !== Boolean(e.vapidPrivateKey)) {
    warnings.push("VAPID 公私鑰需成對設定（缺一則 Web Push 無法運作）");
  }

  // AI 供應商白名單（僅在有提供值時驗證，未設則沿用預設 gemini）
  if (e.aiProvider && e.aiProvider !== "gemini" && e.aiProvider !== "anthropic") {
    warnings.push(`AI_PROVIDER 非法值「${e.aiProvider}」，應為 gemini 或 anthropic`);
  }

  // 生產且已接資料庫卻無 cron 密鑰：定時端點將拒絕外部觸發。
  // 「已接 DB」與 env.isSupabaseConfigured 一致＝需同時有 URL 與 service key。
  if (isProduction && e.supabaseUrl && e.supabaseServiceKey && !e.cronSecret) {
    warnings.push("生產環境未設 CRON_SECRET，定時任務端點將拒絕外部觸發");
  }

  return warnings;
}
