// 失效分潤連結自動重產：短連結過期（非商品下架）時，用同樣的 subId 重新產生一條。
// 解析金鑰順序同 fromUrl：自綁 Shopee API → owner 退環境變數 → affiliate_id 自組 an_redir。
import { isDemoMode } from "@/lib/env";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { getShopeeCredentials, getShopeeAffiliateId, type MaterialToCheck } from "@/lib/store";

// 沿用原本的追蹤 subId（Open API 以 , 串、an_redir 以 - 串；皆為英數段）。
// 空＝刻意不帶 subId（對齊「未設＝不帶來源標記」），不再重建一組，避免重產時冒出非預期 sub_id。
export function subIdsForRegen(stored: string | null): string[] {
  return (stored ?? "")
    .split(/[,-]/)
    .map((s) => s.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 5);
}

// 回傳新短連結＋subId；無法重產（缺金鑰/缺 origin url）回 null。
export async function regenerateAffiliateLink(
  m: MaterialToCheck,
  ownerUserId: string | null
): Promise<{ link: string; subId: string | null } | null> {
  if (isDemoMode || !m.owner_id || !m.clean_product_url) return null;

  const creds = await getShopeeCredentials(m.owner_id);
  if (creds) {
    const subIds = subIdsForRegen(m.affiliate_sub_id);
    const link = await generateAffiliateLink(creds.appId, creds.secret, m.clean_product_url, subIds);
    return { link, subId: subIds.join(",") || null };
  }

  const affiliateId = await getShopeeAffiliateId(m.owner_id);
  if (affiliateId) {
    const subIds = subIdsForRegen(m.affiliate_sub_id);
    return { link: buildAffiliateRedirectLink(m.clean_product_url, affiliateId, subIds), subId: subIds.join("-") || null };
  }
  return null;
}
