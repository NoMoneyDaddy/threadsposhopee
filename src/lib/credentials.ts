// 個人憑證／設定層（profiles 表）：各使用者自綁的 Apify/Gemini 金鑰、Telegram/Discord 通知、
// Shopee affiliate_id、Cloudinary。由 store.ts 拆出（God File 漸進拆分）。
// 金鑰類 AES-256-GCM 加密；chat_id/webhook/affiliate_id/cloudinary 非機密，明文存。
import { getServiceClient } from "./supabase/server";
import { isDemoMode, env } from "./env";
import { decrypt, encrypt } from "./crypto";
import { assertSafePublicUrl } from "./url-guard";
import { log } from "./logger";
import { normalizePlan, type PlanId } from "./plans";
import { parseSlots, type PublishPrefs } from "./publish-prefs";
import { normalizeNotifyPrefs, type NotifyPrefs } from "./notify-prefs";
import type { RepostLimits } from "./repost-limits";

// ── 方案分層（商業化）：每人一個方案字串（非機密，明文存）。限額查 plans.ts ──
export async function getUserPlan(ownerId: string): Promise<PlanId> {
  if (isDemoMode) return "free";
  const sb = getServiceClient();
  if (!sb) return "free";
  const { data } = await sb.from("profiles").select("plan").eq("id", ownerId).maybeSingle();
  return normalizePlan(data?.plan);
}

export async function setUserPlan(ownerId: string, plan: PlanId): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, plan: normalizePlan(plan) }, { onConflict: "id" });
  if (error) throw error;
}

// ── 爬蟲子系統：每個使用者自己綁的 Apify 憑證（owner 用）──────────
// 取出某使用者的 Apify token + actor（解密）。沒綁則回 null（呼叫端可退回全域 env）。
export async function getApifyCredentials(ownerId: string): Promise<{ token: string; actor: string | null } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("apify_token_enc, apify_actor").eq("id", ownerId).maybeSingle();
  if (!data?.apify_token_enc) return null;
  try {
    return { token: decrypt(data.apify_token_enc), actor: data.apify_actor ?? null };
  } catch (e) {
    log.error("解密 Apify token 失敗", { ownerId, err: e });
    return null;
  }
}

// 綁定／更新 Apify 憑證（token 加密）。actor 可選。
export async function setApifyCredentials(ownerId: string, token: string, actor?: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert(
      { id: ownerId, apify_token_enc: encrypt(token), apify_actor: actor || null },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// 是否已綁 Apify（給帳號管理頁顯示狀態，不回傳明文）。
export async function hasApifyCredentials(ownerId: string): Promise<{ bound: boolean; actor: string | null }> {
  if (isDemoMode) return { bound: false, actor: null };
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("apify_token_enc, apify_actor").eq("id", ownerId).maybeSingle();
  return { bound: Boolean(data?.apify_token_enc), actor: data?.apify_actor ?? null };
}

// ── AI 子系統：每個使用者自己綁的 Gemini API key ──────────────
export async function getGeminiKey(ownerId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("gemini_api_key_enc").eq("id", ownerId).maybeSingle();
  if (!data?.gemini_api_key_enc) return null;
  try {
    return decrypt(data.gemini_api_key_enc);
  } catch (e) {
    log.error("解密 Gemini key 失敗", { ownerId, err: e });
    return null;
  }
}

export async function setGeminiKey(ownerId: string, key: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, gemini_api_key_enc: encrypt(key) }, { onConflict: "id" });
  if (error) throw error;
}

// ── 個人 Telegram 通知：每人綁自己的 chat_id（非機密，明文存）。平台共用 bot token 發送 ──
const demoTelegramChatId: Record<string, string> = {};

export async function getUserTelegramChatId(ownerId: string): Promise<string | null> {
  if (isDemoMode) return demoTelegramChatId[ownerId] ?? null;
  const sb = getServiceClient();
  if (!sb) return null;
  const { data } = await sb.from("profiles").select("telegram_chat_id").eq("id", ownerId).maybeSingle();
  const v = data?.telegram_chat_id;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// 反查：哪個使用者綁了這個 Telegram chat（Telegram 遠端審核 webhook 用，以 chat 認 owner）。
// 安全：fail-closed — 同一 chat 綁到多位使用者（資料異常）時，拒絕映射（回 null），
// 避免遠端審核權限隨機錯配到他人草稿。DB 端另有 telegram_chat_id 唯一索引防重複（見 migration）。
export async function getOwnerByTelegramChatId(chatId: string): Promise<string | null> {
  if (isDemoMode) {
    const hits = Object.entries(demoTelegramChatId).filter(([, c]) => c === chatId);
    return hits.length === 1 ? hits[0][0] : null;
  }
  const sb = getServiceClient();
  if (!sb) return null;
  // 取最多 2 筆：恰好 1 筆才映射；0 筆或 >1 筆（重複綁定異常）一律回 null。
  const { data, error } = await sb.from("profiles").select("id").eq("telegram_chat_id", chatId).limit(2);
  if (error) throw error;
  if (!data || data.length !== 1) {
    if (data && data.length > 1) log.error("同一 Telegram chat 綁到多位使用者，拒絕映射", { chatId });
    return null;
  }
  return data[0].id as string;
}

// chatId 傳 null 解除綁定。
export async function setUserTelegramChatId(ownerId: string, chatId: string | null): Promise<void> {
  if (isDemoMode) {
    if (chatId) demoTelegramChatId[ownerId] = chatId;
    else delete demoTelegramChatId[ownerId];
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, telegram_chat_id: chatId }, { onConflict: "id" });
  if (error) throw error;
}

// ── 個人 Discord 通知：每人綁自己的 Discord webhook URL（非機密；伺服器發送前過 SSRF 守衛）──
const demoDiscordWebhook: Record<string, string> = {};

export async function getUserDiscordWebhook(ownerId: string): Promise<string | null> {
  if (isDemoMode) return demoDiscordWebhook[ownerId] ?? null;
  const sb = getServiceClient();
  if (!sb) return null;
  const { data } = await sb.from("profiles").select("discord_webhook_url").eq("id", ownerId).maybeSingle();
  const v = data?.discord_webhook_url;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// url 傳 null 解除綁定。
export async function setUserDiscordWebhook(ownerId: string, url: string | null): Promise<void> {
  if (isDemoMode) {
    if (url) demoDiscordWebhook[ownerId] = url;
    else delete demoDiscordWebhook[ownerId];
    return;
  }
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, discord_webhook_url: url }, { onConflict: "id" });
  if (error) throw error;
}

// ── 預設分潤連結：AI 代理人走 go2read 中轉時，「繼續」的分潤連結預設值（非機密，明文）──
// 建議填蝦皮直營商城（如 https://shopee.tw/shop/50662979）或自己的分潤連結；免得每篇重設。
export const SUGGESTED_DEFAULT_AFFILIATE_URL = "https://shopee.tw/shop/50662979";

export async function getDefaultAffiliateUrl(ownerId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient();
  if (!sb) return null;
  const { data, error } = await sb.from("profiles").select("default_affiliate_url").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(`讀取預設分潤連結失敗：${error.message}`);
  const v = data?.default_affiliate_url;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// url 傳空/null＝解除。設定時驗證為安全公開 URL（擋內網/非法協定）。
export async function setDefaultAffiliateUrl(ownerId: string, url: string | null): Promise<void> {
  const clean = url && url.trim() ? url.trim() : null;
  if (clean) assertSafePublicUrl(clean); // 非法則拋錯
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert({ id: ownerId, default_affiliate_url: clean }, { onConflict: "id" });
  if (error) throw new Error(`儲存預設分潤連結失敗：${error.message}`);
}

export async function hasGeminiKey(ownerId: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("gemini_api_key_enc").eq("id", ownerId).maybeSingle();
  return Boolean(data?.gemini_api_key_enc);
}

// Shopee affiliate_id（無 API 時用 an_redir 自組追蹤連結）。非機密，明文存。
export async function getShopeeAffiliateId(ownerId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("profiles").select("shopee_affiliate_id").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(`讀取 shopee_affiliate_id 失敗：${error.message}`);
  return data?.shopee_affiliate_id ?? null;
}

export async function setShopeeAffiliateId(ownerId: string, affiliateId: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, shopee_affiliate_id: affiliateId || null }, { onConflict: "id" });
  if (error) throw new Error(`儲存 shopee_affiliate_id 失敗：${error.message}`);
}

// 連結失效時是否自動替換為有效分潤連結（用 clean_product_url 重產）。預設關。
export async function getAutoReviveLinks(ownerId: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("profiles").select("auto_revive_links").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(`讀取 auto_revive_links 失敗：${error.message}`);
  return Boolean(data?.auto_revive_links);
}

export async function setAutoReviveLinks(ownerId: string, enabled: boolean): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, auto_revive_links: enabled }, { onConflict: "id" });
  if (error) throw new Error(`儲存 auto_revive_links 失敗：${error.message}`);
}

// 使用者自訂分潤 subId（套用到 API 短連結與 an_redir 長連結）。非機密，明文存。
export async function getShopeeSubId(ownerId: string): Promise<string | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("profiles").select("shopee_sub_id").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(`讀取 shopee_sub_id 失敗：${error.message}`);
  return data?.shopee_sub_id ?? null;
}

export async function setShopeeSubId(ownerId: string, subId: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, shopee_sub_id: subId || null }, { onConflict: "id" });
  if (error) throw new Error(`儲存 shopee_sub_id 失敗：${error.message}`);
}

// 各使用者自綁的 Cloudinary（cloud name + unsigned upload preset，皆非機密，明文存）。
// 沒綁則回 null，呼叫端退回 env 共用設定。
export async function getUserCloudinary(ownerId: string): Promise<{ cloud: string; preset: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("profiles")
    .select("cloudinary_cloud, cloudinary_preset")
    .eq("id", ownerId)
    .maybeSingle();
  // Cloudinary 綁定是「可選」功能：讀取失敗不該中斷整條發文/爬取流程（pipeline 在迴圈外取一次，
  // 拋出會讓整個 source run 失敗）。降級為記錄警告並回 null，自動退回 env 共用設定。
  if (error) {
    log.warn("讀取 Cloudinary 設定失敗，改用共用設定", { ownerId, err: error.message });
    return null;
  }
  const cloud = data?.cloudinary_cloud?.trim();
  const preset = data?.cloudinary_preset?.trim();
  // cloud 與 preset 必須成對才算綁定。不可用 env 預設 preset 補：系統 preset 多半不存在於
  // 使用者帳號，會造成「使用者 cloud + 系統 preset」上傳失敗、靜默降級回原始短效 URL。
  if (!cloud || !preset) return null; // 視為未綁，退回 env 共用設定
  return { cloud, preset };
}

// 完整 Cloudinary 金鑰（cloud + API key/secret，解密）：供「用量面板」查詢用。沒綁回 null。
// 與 getUserCloudinary（上傳用 cloud+preset）分開：API key/secret 為機密，加密存。
export async function getUserCloudinaryFull(
  ownerId: string
): Promise<{ cloud: string; apiKey: string; apiSecret: string } | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("profiles")
    .select("cloudinary_cloud, cloudinary_api_key_enc, cloudinary_api_secret_enc")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) {
    log.warn("讀取 Cloudinary 完整金鑰失敗", { ownerId, err: error.message });
    return null;
  }
  const cloud = data?.cloudinary_cloud?.trim();
  if (!cloud || !data?.cloudinary_api_key_enc || !data?.cloudinary_api_secret_enc) return null;
  try {
    return { cloud, apiKey: decrypt(data.cloudinary_api_key_enc), apiSecret: decrypt(data.cloudinary_api_secret_enc) };
  } catch (e) {
    log.error("解密 Cloudinary API 金鑰失敗", { ownerId, err: e });
    return null;
  }
}

// 儲存 Cloudinary 設定。apiKey/apiSecret 為選填（給用量面板用）：傳空白＝不變動；cloud 清空＝整組解除（含金鑰）。
export async function setUserCloudinary(
  ownerId: string,
  cloud: string | null,
  preset: string | null,
  apiKey?: string | null,
  apiSecret?: string | null
): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const patch: Record<string, unknown> = {
    id: ownerId,
    cloudinary_cloud: cloud || null,
    cloudinary_preset: preset || null
  };
  if (!cloud) {
    patch.cloudinary_api_key_enc = null;
    patch.cloudinary_api_secret_enc = null;
  } else {
    if (apiKey && apiKey.trim()) patch.cloudinary_api_key_enc = encrypt(apiKey.trim());
    if (apiSecret && apiSecret.trim()) patch.cloudinary_api_secret_enc = encrypt(apiSecret.trim());
  }
  const { error } = await sb.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(`儲存 Cloudinary 設定失敗：${error.message}`);
}

// ── Cloudflare R2 圖床（S3 相容，與 Cloudinary 二擇一）──────────
// access key/secret 為機密 → 加密存；account_id/bucket/public_base 明文。沒綁回 null。
export type R2Settings = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
};

export async function getUserR2(ownerId: string): Promise<R2Settings | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("profiles")
    .select("r2_account_id, r2_access_key_id_enc, r2_secret_enc, r2_bucket, r2_public_base")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) {
    log.warn("讀取 R2 設定失敗，改用其他圖床", { ownerId, err: error.message });
    return null;
  }
  const accountId = data?.r2_account_id?.trim();
  const bucket = data?.r2_bucket?.trim();
  const publicBase = data?.r2_public_base?.trim();
  if (!accountId || !bucket || !publicBase || !data?.r2_access_key_id_enc || !data?.r2_secret_enc) return null;
  try {
    return {
      accountId,
      bucket,
      publicBase,
      accessKeyId: decrypt(data.r2_access_key_id_enc),
      secretAccessKey: decrypt(data.r2_secret_enc)
    };
  } catch (e) {
    log.error("解密 R2 金鑰失敗", { ownerId, err: e });
    return null;
  }
}

// 是否已綁 R2（給設定頁顯示狀態，不回明文）。
export async function hasUserR2(ownerId: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("profiles")
    .select("r2_account_id, r2_bucket, r2_public_base, r2_secret_enc")
    .eq("id", ownerId)
    .maybeSingle();
  return Boolean(data?.r2_account_id && data?.r2_bucket && data?.r2_public_base && data?.r2_secret_enc);
}

// 儲存 R2 設定。傳空白 accountId＝整組解除。accessKeyId/secret 空白＝沿用既有（只改網域/bucket）。
export async function setUserR2(
  ownerId: string,
  s: { accountId: string | null; accessKeyId?: string | null; secretAccessKey?: string | null; bucket?: string | null; publicBase?: string | null }
): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const accountId = s.accountId?.trim() || null;
  const patch: Record<string, unknown> = { id: ownerId };
  if (!accountId) {
    Object.assign(patch, {
      r2_account_id: null,
      r2_access_key_id_enc: null,
      r2_secret_enc: null,
      r2_bucket: null,
      r2_public_base: null
    });
  } else {
    patch.r2_account_id = accountId;
    patch.r2_bucket = s.bucket?.trim() || null;
    patch.r2_public_base = s.publicBase?.trim().replace(/\/+$/, "") || null;
    if (s.accessKeyId && s.accessKeyId.trim()) patch.r2_access_key_id_enc = encrypt(s.accessKeyId.trim());
    if (s.secretAccessKey && s.secretAccessKey.trim()) patch.r2_secret_enc = encrypt(s.secretAccessKey.trim());
  }
  const { error } = await sb.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(`儲存 R2 設定失敗：${error.message}`);
}

// ── Link-in-bio：公開 bio 頁代稱（handle）與標題（非機密，明文存）──────
// 純函式：正規化 handle（小寫、僅英數底線連字號、長度 3–30）。不合法回 null。可測。
export function normalizeBioHandle(input: string | null | undefined): string | null {
  const h = (input ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{3,30}$/.test(h) ? h : null;
}

export async function getBioSettings(ownerId: string): Promise<{ handle: string | null; title: string | null }> {
  if (isDemoMode) return { handle: null, title: null };
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("bio_handle, bio_title").eq("id", ownerId).maybeSingle();
  return { handle: data?.bio_handle ?? null, title: data?.bio_title ?? null };
}

// handle 傳 null 解除（清空）；傳值前須先過 normalizeBioHandle。撞他人已用 handle → 友善錯誤。
export async function setBioSettings(ownerId: string, handle: string | null, title: string | null): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, bio_handle: handle, bio_title: title || null }, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") throw new Error("這個代稱已被使用，請換一個");
    throw new Error(`儲存 bio 設定失敗：${error.message}`);
  }
}

// ── 高貢獻者贊助文回饋方式：exempt（免發）｜own_link（換成自己的分潤連結）──────
export type SponsorRewardMode = "exempt" | "own_link";

export async function getSponsorRewardMode(ownerId: string): Promise<SponsorRewardMode> {
  if (isDemoMode) return "exempt";
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("sponsor_reward_mode").eq("id", ownerId).maybeSingle();
  return data?.sponsor_reward_mode === "own_link" ? "own_link" : "exempt";
}

export async function setSponsorRewardMode(ownerId: string, mode: SponsorRewardMode): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const v: SponsorRewardMode = mode === "own_link" ? "own_link" : "exempt";
  const { error } = await sb.from("profiles").upsert({ id: ownerId, sponsor_reward_mode: v }, { onConflict: "id" });
  if (error) throw new Error(`儲存回饋方式失敗：${error.message}`);
}

// ── 每位使用者發文節奏（slots/min gap/max per day）：留空沿用 env 預設 ──────
export async function getPublishPrefs(ownerId: string): Promise<PublishPrefs> {
  const fallback: PublishPrefs = {
    slots: env.publishSlots.length ? env.publishSlots : ["09:00", "12:30", "20:00"],
    minGapMinutes: env.publishMinGapMinutes,
    maxPerDay: env.publishMaxPerDay
  };
  if (isDemoMode) return fallback;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("profiles")
    .select("publish_slots, publish_min_gap_minutes, publish_max_per_day")
    .eq("id", ownerId)
    .maybeSingle();
  if (!data) return fallback;
  const slots = parseSlots(data.publish_slots);
  return {
    slots: slots.length ? slots : fallback.slots,
    minGapMinutes: data.publish_min_gap_minutes ?? fallback.minGapMinutes,
    maxPerDay: data.publish_max_per_day ?? fallback.maxPerDay
  };
}

export async function setPublishPrefs(
  ownerId: string,
  prefs: { slots: string[]; minGapMinutes: number | null; maxPerDay: number | null }
): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert(
    {
      id: ownerId,
      publish_slots: prefs.slots.length ? prefs.slots.join(",") : null,
      publish_min_gap_minutes: prefs.minGapMinutes,
      publish_max_per_day: prefs.maxPerDay
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`儲存發文節奏失敗：${error.message}`);
}

// ── 每位使用者「同素材重複發文上限」（0／NULL＝不限）──────
export async function getRepostLimits(ownerId: string): Promise<RepostLimits> {
  if (isDemoMode) return { perAccount: 0, total: 0 };
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("profiles")
    .select("repost_max_per_account, repost_max_total")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`讀取重發上限失敗：${error.message}`);
  return {
    perAccount: data?.repost_max_per_account ?? 0,
    total: data?.repost_max_total ?? 0
  };
}

export async function setRepostLimits(ownerId: string, limits: RepostLimits): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("profiles").upsert(
    {
      id: ownerId,
      // 0 視為不限 → 存 NULL，語意一致
      repost_max_per_account: limits.perAccount > 0 ? limits.perAccount : null,
      repost_max_total: limits.total > 0 ? limits.total : null
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`儲存重發上限失敗：${error.message}`);
}

// ── 每位使用者通知個別開關（notify_prefs jsonb）：預設全開 ──────
export async function getNotifyPrefs(ownerId: string): Promise<NotifyPrefs> {
  if (isDemoMode) return normalizeNotifyPrefs(null);
  const sb = getServiceClient()!;
  const { data } = await sb.from("profiles").select("notify_prefs").eq("id", ownerId).maybeSingle();
  let raw: unknown = data?.notify_prefs ?? null;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  return normalizeNotifyPrefs(raw);
}

export async function setNotifyPrefs(ownerId: string, prefs: NotifyPrefs): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: ownerId, notify_prefs: normalizeNotifyPrefs(prefs) }, { onConflict: "id" });
  if (error) throw new Error(`儲存通知偏好失敗：${error.message}`);
}
