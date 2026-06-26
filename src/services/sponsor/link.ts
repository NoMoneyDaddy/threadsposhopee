// 贊助文分潤連結：用商品「原始連結」＋ owner 金鑰即時轉成「每帳號 sp_<帳號碼>」分潤連結。
// 失敗時上層退回靜態後備連結（無每帳號追蹤）。
import { expandShopeeLink } from "@/services/shopee/expand";
import { generateAffiliateLink, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { normalizeSubIds, parseSubIdSlots, resolveSubIdTemplate } from "@/services/shopee/subid";
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

// 為某帳號產生贊助分潤連結，sub_id 用 owner 設定的贊助 subId 範本（逐格代換變數）。無金鑰/失敗回 null。
// subIdTemplate：逗號分隔多格，支援 {date}/{time}/{platform}/{account}/{item}；未設則回退 owner 既有 subId。
export async function buildSponsorLinkForAccount(
  res: SponsorLinkResources,
  accountId: string,
  subIdTemplate?: string | null
): Promise<string | null> {
  if (!res.cleanUrl) return null;
  const now = new Date();
  const ctx = {
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }).replace(/-/g, ""),
    time: now.toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).replace(":", ""),
    platform: "threads",
    account: accountId.slice(0, 8),
    item: ""
  };
  const template = subIdTemplate?.trim() ? subIdTemplate : res.ownerSubId;
  const subIds = normalizeSubIds(parseSubIdSlots(template).map((slot) => resolveSubIdTemplate(slot, ctx)));
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
