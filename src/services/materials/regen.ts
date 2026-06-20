// 失效分潤連結自動重產：短連結過期（非商品下架）時，用同樣的 subId 重新產生一條。
// 解析金鑰順序同 fromUrl：自綁 Shopee API → owner 退環境變數 → affiliate_id 自組 an_redir。
import { env, isDemoMode } from "@/lib/env";
import { generateAffiliateLink, buildAffiliateRedirectLink, buildSubIds } from "@/services/shopee/affiliate";
import { getShopeeCredentials, getShopeeAffiliateId, type MaterialToCheck } from "@/lib/store";

// 沿用原本的追蹤 subId（Open API 以 , 串、an_redir 以 - 串；皆為英數段）。
// 還原不到時用 item_id 重建一組，確保仍可分流統計。
export function subIdsForRegen(stored: string | null, itemId: string, base?: string | null): string[] {
  const parts = (stored ?? "")
    .split(/[,-]/)
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean);
  if (parts.length) return parts.slice(0, 5);
  return buildSubIds(base, "regen", itemId);
}

// 回傳新短連結＋subId；無法重產（缺金鑰/缺 origin url）回 null。
export async function regenerateAffiliateLink(
  m: MaterialToCheck,
  ownerUserId: string | null
): Promise<{ link: string; subId: string } | null> {
  if (isDemoMode || !m.owner_id || !m.clean_product_url) return null;

  let creds = await getShopeeCredentials(m.owner_id);
  // owner 沒自綁則退環境變數金鑰（僅限該素材確實屬於 owner）
  if (!creds && ownerUserId && m.owner_id === ownerUserId && env.shopeeAppId && env.shopeeSecret) {
    creds = { appId: env.shopeeAppId, secret: env.shopeeSecret, subId: env.shopeeDefaultSubId };
  }

  if (creds) {
    const subIds = subIdsForRegen(m.affiliate_sub_id, m.item_id, creds.subId);
    const link = await generateAffiliateLink(creds.appId, creds.secret, m.clean_product_url, subIds);
    return { link, subId: subIds.join(",") };
  }

  const affiliateId = await getShopeeAffiliateId(m.owner_id);
  if (affiliateId) {
    const subIds = subIdsForRegen(m.affiliate_sub_id, m.item_id);
    return { link: buildAffiliateRedirectLink(m.clean_product_url, affiliateId, subIds), subId: subIds.join("-") };
  }
  return null;
}
