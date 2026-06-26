// 贊助文分潤連結：用商品「原始連結」＋ owner 金鑰即時轉成「每帳號 sp_<帳號碼>」分潤連結。
// 失敗時上層退回靜態後備連結（無每帳號追蹤）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { normalizeSubId, normalizeSubIds, parseSubIdSlots } from "@/services/shopee/subid";
import { getShopeeCredentials, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";

export interface SponsorLinkResources {
  cleanUrl: string | null; // 該篇貼文的乾淨商品連結（就地改寫用）
  ownerCreds: { appId: string; secret: string; subId: string } | null;
  ownerAffiliateId: string | null;
  ownerSubId: string | null; // owner 自訂 subId 基底
}

// 只取 owner（或貢獻者）金鑰資源，不綁特定商品：贊助文改為「就地改寫該篇貼文的商品連結」。
export async function resolveSponsorOwnerCreds(ownerId: string): Promise<Omit<SponsorLinkResources, "cleanUrl">> {
  const [ownerCreds, ownerAffiliateId, ownerSubId] = await Promise.all([
    getShopeeCredentials(ownerId).catch(() => null),
    getShopeeAffiliateId(ownerId).catch(() => null),
    getShopeeSubId(ownerId).catch(() => null)
  ]);
  return { ownerCreds, ownerAffiliateId, ownerSubId };
}

// 從草稿取「乾淨商品連結」：優先 clean_product_url，否則展開草稿的分潤短連結。null＝無法取得（不可贊助改寫）。
export async function cleanProductUrlFromDraft(d: {
  clean_product_url?: string | null;
  shopee_short_link?: string | null;
}): Promise<string | null> {
  if (d.clean_product_url) return d.clean_product_url;
  const link = d.shopee_short_link?.trim();
  if (!link) return null;
  const expanded = await expandShopeeLink(link).catch(() => null);
  return expanded?.cleanUrl ?? null;
}

// 為某帳號產生帶 sp_<帳號碼> subId 的贊助分潤連結。無金鑰/失敗回 null。
export async function buildSponsorLinkForAccount(res: SponsorLinkResources, accountId: string): Promise<string | null> {
  if (!res.cleanUrl) return null;
  const acctSub = normalizeSubId(`sp_${accountId.slice(0, 8)}`);
  // owner 自訂 subId 可能為多格（逗號分隔）；逐格正規化後＋帳號標記，取前 5。
  const subIds = normalizeSubIds([...parseSubIdSlots(res.ownerSubId), acctSub]);
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
