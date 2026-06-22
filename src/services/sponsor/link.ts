// 贊助文章分潤連結：用商品「原始連結」＋ owner 金鑰即時轉成「每帳號 sp_<帳號碼>」分潤連結。
// 失敗時上層退回靜態後備連結（無每帳號追蹤）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { normalizeSubId } from "@/services/shopee/subid";
import { getShopeeCredentials, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";

export interface SponsorLinkResources {
  cleanUrl: string | null; // 展開後的乾淨商品連結（整輪快取一次）
  ownerCreds: { appId: string; secret: string; subId: string } | null;
  ownerAffiliateId: string | null;
  ownerSubId: string | null; // owner 自訂 subId 基底
}

// 整輪取一次：owner 自綁的 Shopee 金鑰／affiliate_id／自訂 subId，並展開商品原始連結。
export async function resolveSponsorResources(productUrl: string, ownerId: string): Promise<SponsorLinkResources> {
  const [ownerCreds, ownerAffiliateId, ownerSubId] = await Promise.all([
    getShopeeCredentials(ownerId).catch(() => null),
    getShopeeAffiliateId(ownerId).catch(() => null),
    getShopeeSubId(ownerId).catch(() => null)
  ]);
  const expanded = await expandShopeeLink(productUrl).catch(() => null);
  const cleanUrl = expanded?.cleanUrl ?? productUrl;
  return { cleanUrl, ownerCreds, ownerAffiliateId, ownerSubId };
}

// 為某帳號產生帶 sp_<帳號碼> subId 的贊助分潤連結。無金鑰/失敗回 null。
export async function buildSponsorLinkForAccount(res: SponsorLinkResources, accountId: string): Promise<string | null> {
  if (!res.cleanUrl) return null;
  const acctSub = normalizeSubId(`sp_${accountId.slice(0, 8)}`);
  const subIds = [normalizeSubId(res.ownerSubId), acctSub].filter((s) => s.length > 0);
  try {
    if (res.ownerCreds) {
      return await generateAffiliateLink(res.ownerCreds.appId, res.ownerCreds.secret, res.cleanUrl, subIds);
    }
    if (res.ownerAffiliateId) {
      return buildAffiliateRedirectLink(res.cleanUrl, res.ownerAffiliateId, subIds);
    }
  } catch {
    return null;
  }
  return null;
}
