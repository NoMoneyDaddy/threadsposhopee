// 從一個蝦皮連結解析並建立素材（單筆 /api/materials 與批次共用）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial, getShopeeCredentials, getGeminiKey, resolveGeminiModel, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";
import { getMediaProvider } from "@/services/media/upload";
import { assertSafePublicUrl } from "@/lib/url-guard";
import type { AppUser } from "@/lib/auth";
import type { Material, DraftMedia } from "@/lib/types";

export async function resolveMaterialFromUrl(
  url: string,
  user: AppUser,
  withCopy = true,
  media?: { url: string; type: "image" | "video" },
  mediaList?: DraftMedia[]
): Promise<{ material: Material; reused: boolean; notes: string[] }> {
  const ownerId = user.id;
  const hasOwnMedia = Boolean(media?.url) || (mediaList?.length ?? 0) > 0;
  // 自帶媒體先逐項過 SSRF 守衛（擋內網/非法協定），不合法直接擋下。
  if (media?.url) assertSafePublicUrl(media.url);
  for (const m of mediaList ?? []) assertSafePublicUrl(m.url);
  const expanded = await expandShopeeLink(url);
  if (!expanded) throw new Error("無法從連結解析商品 id（shop_id/item_id）");

  // 有自帶媒體時不沿用既有素材（否則新媒體不會生效）；否則命中有效素材直接帶出，省 token。
  if (!hasOwnMedia) {
    const existing = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
    if (existing && existing.affiliate_valid && existing.affiliate_short_link) {
      return { material: existing, reused: true, notes: [] };
    }
  }

  // Shopee 金鑰：一律用自綁（shopee_accounts），沒綁則改走 affiliate_id 後備（見下）。
  const shopeeCreds = await getShopeeCredentials(ownerId);
  // AI 文案只用「使用者自己綁的」Gemini 金鑰；沒綁就略過文案，不借用系統共用金鑰。
  const geminiKey = await getGeminiKey(ownerId);
  const geminiModel = await resolveGeminiModel(ownerId);
  const canCopy = withCopy && Boolean(geminiKey);
  // 沒綁 Shopee API 時的後備：用 affiliate_id 自組追蹤連結
  const affiliateId = shopeeCreds ? null : await getShopeeAffiliateId(ownerId);
  // 各人自綁圖床（R2 或 Cloudinary，素材進自己雲端）；沒綁則不中轉媒體
  const mediaProvider = await getMediaProvider(ownerId);
  const customSubId = await getShopeeSubId(ownerId);

  const notes: string[] = [];
  if (withCopy && !geminiKey) notes.push("未綁定自己的 Gemini 金鑰，已略過 AI 文案（到帳號管理綁定後可重產）");
  const material = await buildMaterialForProduct(
    {
      shopId: expanded.shopId,
      itemId: expanded.itemId,
      cleanUrl: expanded.cleanUrl,
      originalShortLink: url,
      subIdTag: user.isOwner ? "manual" : ownerId.slice(0, 8),
      customSubId,
      withCopy: canCopy,
      media: media ? { url: media.url, type: media.type } : undefined,
      mediaList: mediaList && mediaList.length > 0 ? mediaList : undefined
    },
    ownerId,
    shopeeCreds,
    notes,
    geminiKey,
    undefined,
    affiliateId,
    mediaProvider,
    geminiModel
  );
  return { material, reused: false, notes };
}
