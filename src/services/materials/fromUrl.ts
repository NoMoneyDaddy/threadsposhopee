// 從一個蝦皮連結解析並建立素材（單筆 /api/materials 與批次共用）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial, getShopeeCredentials, getGeminiKey, getShopeeAffiliateId, getUserCloudinary } from "@/lib/store";
import { env } from "@/lib/env";
import type { AppUser } from "@/lib/auth";
import type { Material } from "@/lib/types";

export async function resolveMaterialFromUrl(
  url: string,
  user: AppUser,
  withCopy = true
): Promise<{ material: Material; reused: boolean; notes: string[] }> {
  const ownerId = user.id;
  const expanded = await expandShopeeLink(url);
  if (!expanded) throw new Error("無法從連結解析商品 id（shop_id/item_id）");

  const existing = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
  if (existing && existing.affiliate_valid && existing.affiliate_short_link) {
    return { material: existing, reused: true, notes: [] };
  }

  // Shopee 金鑰：優先用自綁（shopee_accounts），owner 沒綁則退回環境變數
  let shopeeCreds = await getShopeeCredentials(ownerId);
  if (!shopeeCreds && user.isOwner && env.shopeeAppId && env.shopeeSecret) {
    shopeeCreds = { appId: env.shopeeAppId, secret: env.shopeeSecret, subId: env.shopeeDefaultSubId };
  }
  // AI 文案只用「使用者自己綁的」Gemini 金鑰；沒綁就略過文案，不借用系統共用金鑰。
  const geminiKey = await getGeminiKey(ownerId);
  const canCopy = withCopy && Boolean(geminiKey);
  // 沒綁 Shopee API 時的後備：用 affiliate_id 自組追蹤連結
  const affiliateId = shopeeCreds ? null : await getShopeeAffiliateId(ownerId);
  // 各人自綁 Cloudinary（素材進自己雲端）；沒綁退回 env 共用
  const cloudinaryCreds = await getUserCloudinary(ownerId);

  const notes: string[] = [];
  if (withCopy && !geminiKey) notes.push("未綁定自己的 Gemini 金鑰，已略過 AI 文案（到帳號管理綁定後可重產）");
  const material = await buildMaterialForProduct(
    {
      shopId: expanded.shopId,
      itemId: expanded.itemId,
      cleanUrl: expanded.cleanUrl,
      originalShortLink: url,
      subIdTag: user.isOwner ? "manual" : ownerId.slice(0, 8),
      withCopy: canCopy
    },
    ownerId,
    shopeeCreds,
    notes,
    geminiKey,
    undefined,
    affiliateId,
    cloudinaryCreds
  );
  return { material, reused: false, notes };
}
