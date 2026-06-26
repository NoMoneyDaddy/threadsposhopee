// 為單一商品建立素材的共用邏輯：換分潤連結(帶追蹤 subId) → 商品名 → 媒體中轉 →
// (可選)AI 文案 → 存素材。自動爬取流程與手動建立流程共用此函式。
import { isDemoMode } from "@/lib/env";
import { generateAffiliateLink, getProductInfo, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { resolveSubIdTemplate, normalizeSubIds, parseSubIdSlots } from "@/services/shopee/subid";
import { cleanProductName } from "@/lib/product-name";
import { generateCopy } from "@/services/ai/provider";
import { uploadMediaWith, type MediaProvider } from "@/services/media/upload";
import { createMaterial, getCopyPrefs } from "@/lib/store";
import type { CopyPrefs } from "@/services/ai/prefs";
import type { Material, DraftMedia } from "@/lib/types";

interface BuildMaterialInput {
  shopId: string;
  itemId: string;
  cleanUrl: string;
  originalShortLink: string;
  // 單一媒體（向後相容）或多媒體（同一篇的影片＋圖）。兩者擇一傳入。
  media?: { url: string | null; type: "image" | "video" | "none" };
  mediaList?: DraftMedia[];
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
  mediaProvider?: MediaProvider | null // 使用者自綁圖床（R2 或 Cloudinary）；沒綁則不中轉、沿用原 URL（無 env 後備）
): Promise<Material> {
  // 媒體清單：優先 mediaList（多媒體），否則退回單一 media 欄位。過濾無效項。
  const inputMedia: DraftMedia[] =
    input.mediaList && input.mediaList.length > 0
      ? input.mediaList.filter((m): m is DraftMedia => Boolean(m?.url) && (m.type === "image" || m.type === "video"))
      : input.media && input.media.url && input.media.type !== "none"
        ? [{ url: input.media.url, type: input.media.type }]
        : [];
  // 主要媒體（第一個）：供文案產生與單一 media 欄位向後相容。
  const primary = inputMedia[0] ?? null;
  let shortLink = input.originalShortLink;
  let subId: string | null = null;
  let productNameRaw: string | null = null;
  let commissionRate: string | null = null; // 目前分潤率（顯示用）；隨時間變動，記查詢時間

  // 自訂 subId：使用者最多 5 格（逗號分隔），每格支援範本 {date}/{time}/{platform}/{account}/{item}。
  // 解析→逐格代換→與來源/商品併入，正規化去重後取前 5（對應蝦皮 sub_id1..5）。未設＝不帶來源標記（無預設）。
  const account = input.subIdTag ?? "manual";
  const subIdNow = new Date();
  const dateStr = subIdNow.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, "");
  const timeStr = subIdNow.toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", "");
  const ctx = { date: dateStr, time: timeStr, platform: "threads", account, item: input.itemId ? String(input.itemId) : "" };
  const resolvedSlots = parseSubIdSlots(input.customSubId).map((slot) => resolveSubIdTemplate(slot, ctx));

  if (!isDemoMode && shopeeCreds) {
    try {
      const subIds = normalizeSubIds([...resolvedSlots, account, input.itemId]);
      subId = subIds.join(",");
      shortLink = await generateAffiliateLink(shopeeCreds.appId, shopeeCreds.secret, input.cleanUrl, subIds);
      const info = await getProductInfo(shopeeCreds.appId, shopeeCreds.secret, input.shopId, input.itemId);
      productNameRaw = info.productName;
      commissionRate = info.commissionRate;
    } catch (e) {
      notes.push(`Shopee API 失敗（用原連結）：${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (!isDemoMode && affiliateId) {
    // 無 Open API，但有 affiliate_id：用官方 an_redir 做法自組追蹤連結（仍可分潤＋subId 分流）
    const subIds = normalizeSubIds([...resolvedSlots, account, input.itemId]);
    subId = subIds.join("-");
    shortLink = buildAffiliateRedirectLink(input.cleanUrl, affiliateId, subIds);
    productNameRaw = `商品 ${input.itemId}`;
    notes.push("未綁 Shopee API：用 affiliate_id 自組 an_redir 追蹤連結");
  } else {
    productNameRaw = `商品 ${input.itemId}`;
    notes.push(isDemoMode ? "Demo 模式：用原連結與假商品名" : "未提供 Shopee 金鑰：直接用貼上的分潤連結");
  }
  // 乾淨核心品名：給文案與草稿標題（避免被 SEO 關鍵字帶歪）；原始標題另存。
  const productName = cleanProductName(productNameRaw) || productNameRaw;

  // 逐一中轉媒體到自綁圖床（同一篇的影片＋圖都進自己雲端）；單項失敗暫用原連結，不擋建立。
  let uploadedMedia: DraftMedia[] = inputMedia;
  const mediaKeyHint = `${input.shopId}_${input.itemId}`; // 圖床以商品分組命名
  if (!isDemoMode && inputMedia.length > 0 && mediaProvider && mediaProvider.kind !== "none") {
    uploadedMedia = await Promise.all(
      inputMedia.map(async (m) => {
        try {
          return { url: await uploadMediaWith(mediaProvider, m.url, m.type, mediaKeyHint), type: m.type };
        } catch (e) {
          notes.push(`圖床上傳失敗（暫用原連結）：${e instanceof Error ? e.message : String(e)}`);
          return m;
        }
      })
    );
  }
  const primaryUploaded = uploadedMedia[0] ?? null;

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
        mediaUrl: primary?.url ?? null,
        mediaType: primary?.type ?? "none"
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
    media_type: primary?.type ?? "none",
    source_media_url: primary?.url ?? null,
    cloudinary_media_url: primaryUploaded?.url ?? null,
    media: uploadedMedia,
    product_name_raw: productNameRaw,
    commission_rate: commissionRate,
    commission_checked_at: commissionRate ? now : null,
    main_text: mainText,
    reply_text: replyText,
    ai_raw: aiRaw,
    ai_generated_at: aiAt
  }, ownerId);
}
