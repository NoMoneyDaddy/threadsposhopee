// 從一個蝦皮連結解析並建立素材（單筆 /api/materials 與批次共用）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial, getShopeeCredentials } from "@/lib/store";
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

  // owner 用環境變數金鑰；member 用自己的金鑰（可能為 null → 直接用貼上的連結）
  let shopeeCreds: { appId: string; secret: string; subId: string } | null = null;
  if (user.isOwner && env.shopeeAppId && env.shopeeSecret) {
    shopeeCreds = { appId: env.shopeeAppId, secret: env.shopeeSecret, subId: env.shopeeDefaultSubId };
  } else {
    shopeeCreds = await getShopeeCredentials(ownerId);
  }

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
    notes
  );
  return { material, reused: false, notes };
}
