// 為單一商品建立素材的共用邏輯：換分潤連結(帶追蹤 subId) → 商品名 → 媒體中轉 →
// (可選)AI 文案 → 存素材。自動爬取流程與手動建立流程共用此函式。
import { isDemoMode } from "@/lib/env";
import { generateAffiliateLink, getProductName, buildSubIds, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { resolveSubIdTemplate } from "@/services/shopee/subid";
import { generateCopy } from "@/services/ai/provider";
import { uploadToCloudinary } from "@/services/media/cloudinary";
import { createMaterial, getCopyPrefs } from "@/lib/store";
import type { CopyPrefs } from "@/services/ai/prefs";
import type { Material } from "@/lib/types";

interface BuildMaterialInput {
  shopId: string;
  itemId: string;
  cleanUrl: string;
  originalShortLink: string;
  media?: { url: string | null; type: "image" | "video" | "none" };
  sourceText?: string;
  subIdTag?: string; // 追蹤用：來源帳號或 "manual"
  customSubId?: string | null; // 使用者自訂 subId（套用兩種連結）；空＝用預設
  withCopy?: boolean; // 是否生成 AI 文案（手動建立可先不生成，之後再補）
}

export async function buildMaterialForProduct(
  input: BuildMaterialInput,
  ownerId: string,
  // 該使用者要用的 Shopee 分潤金鑰；null = 不轉換（直接用貼上的連結）。
  // owner 傳入環境變數金鑰；member 傳入自己的金鑰或 null。
  shopeeCreds: { appId: string; secret: string; subId: string } | null,
  notes: string[] = [],
  geminiKey?: string | null, // 使用者自綁的 Gemini key；沒傳則退回 env
  copyPrefs?: CopyPrefs, // 文案偏好；上層（pipeline 迴圈）先取好傳入，避免每篇重查
  affiliateId?: string | null, // 無 API 時的後備：用 affiliate_id 組 an_redir 追蹤連結
  cloudinaryCreds?: { cloud: string; preset: string } | null // 使用者自綁 Cloudinary；沒綁則不中轉、沿用原 URL（無 env 後備）
): Promise<Material> {
  const media = input.media ?? { url: null, type: "none" as const };
  let shortLink = input.originalShortLink;
  let subId: string | null = null;
  let productName: string | null = null;

  // 自訂 subId 支援範本：{date}（台北 YYYYMMDD）/{platform}/{account}（subIdTag）智能帶入。
  const account = input.subIdTag ?? "manual";
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, "");
  const resolvedSubId = input.customSubId
    ? resolveSubIdTemplate(input.customSubId, { date: dateStr, platform: "threads", account })
    : "";

  if (!isDemoMode && shopeeCreds) {
    try {
      const subIds = buildSubIds(resolvedSubId || shopeeCreds.subId, account, input.itemId);
      subId = subIds.join(",");
      shortLink = await generateAffiliateLink(shopeeCreds.appId, shopeeCreds.secret, input.cleanUrl, subIds);
      productName = await getProductName(shopeeCreds.appId, shopeeCreds.secret, input.shopId, input.itemId);
    } catch (e) {
      notes.push(`Shopee API 失敗（用原連結）：${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!isDemoMode && affiliateId) {
    // 無 Open API，但有 affiliate_id：用官方 an_redir 做法自組追蹤連結（仍可分潤＋subId 分流）
    const subIds = buildSubIds(resolvedSubId || null, account, input.itemId);
    subId = subIds.join("-");
    shortLink = buildAffiliateRedirectLink(input.cleanUrl, affiliateId, subIds);
    productName = `商品 ${input.itemId}`;
    notes.push("未綁 Shopee API：用 affiliate_id 自組 an_redir 追蹤連結");
  } else {
    productName = `商品 ${input.itemId}`;
    notes.push(isDemoMode ? "Demo 模式：用原連結與假商品名" : "未提供 Shopee 金鑰：直接用貼上的分潤連結");
  }

  let cloudinaryMediaUrl = media.url;
  if (!isDemoMode && media.url && media.type !== "none") {
    try {
      cloudinaryMediaUrl = await uploadToCloudinary(media.url, media.type, cloudinaryCreds);
    } catch (e) {
      notes.push(`Cloudinary 上傳失敗（暫用原連結）：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let mainText: string | null = null;
  let replyText: string | null = null;
  let aiRaw: string | null = null;
  let aiAt: string | null = null;
  if (input.withCopy !== false) {
    const prefs = copyPrefs ?? (await getCopyPrefs(ownerId)); // 套用該使用者的文案客製化偏好
    const copy = await generateCopy(
      {
        productName: productName ?? "這個好物",
        shopeeShortLink: shortLink,
        sourceText: input.sourceText,
        mediaUrl: media.url,
        mediaType: media.type
      },
      geminiKey,
      prefs
    );
    mainText = copy.mainText;
    replyText = copy.replyText;
    aiRaw = copy.raw;
    aiAt = new Date().toISOString();
  }

  const now = new Date().toISOString();
  return createMaterial({
    shop_id: input.shopId,
    item_id: input.itemId,
    product_name: productName,
    clean_product_url: input.cleanUrl,
    affiliate_short_link: shortLink,
    affiliate_sub_id: subId,
    affiliate_generated_at: now,
    affiliate_valid: true,
    media_type: media.type,
    source_media_url: media.url,
    cloudinary_media_url: cloudinaryMediaUrl,
    main_text: mainText,
    reply_text: replyText,
    ai_raw: aiRaw,
    ai_generated_at: aiAt
  }, ownerId);
}
