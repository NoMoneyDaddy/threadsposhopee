// 從一個蝦皮連結解析並建立素材（單筆 /api/materials 與批次共用）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial, getShopeeCredentials, getGeminiKey } from "@/lib/store";
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
  // Gemini key：自綁優先，沒綁退回 env（在 generateCopy 內處理）
  const geminiKey = await getGeminiKey(ownerId);

  const notes: string[] = [];
  const material = await buildMaterialForProduct(
    {
      shopId: expanded.shopId,
      itemId: expanded.itemId,
      cleanUrl: expanded.cleanUrl,
      originalShortLink: url,
      subIdTag: user.isOwner ? "manual" : ownerId.slice(0, 8),
      withCopy
    },
    ownerId,
    shopeeCreds,
    notes,
    geminiKey
  );
  return { material, reused: false, notes };
}
