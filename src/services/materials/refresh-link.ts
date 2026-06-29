// 「刷新分潤連結」：用使用者「當前」的 Shopee 金鑰＋當前 Sub id 設定，就地重產分潤短連結。
// 用途：改了 Sub id 設定、或連結失效／商品重上架時，想更新單筆素材/草稿的連結而「不必整批重抓」。
// 與素材建立（build.ts）一致：subId 只用使用者設定範本（解析後），未設＝不帶 sub_id。
import { generateAffiliateLink, buildAffiliateRedirectLink } from "@/services/shopee/affiliate";
import { resolveSubIdTemplate, normalizeSubIds, parseSubIdSlots, subIdDateTimeParts } from "@/services/shopee/subid";
import { getShopeeCredentials, getShopeeAffiliateId, getShopeeSubId } from "@/lib/store";

// 依使用者設定的 Sub id 範本解析出實際 subIds（與 build.ts 同邏輯）。account/item 供 {account}/{item} 代換。
export async function resolveUserSubIds(ownerId: string, item: string, account: string, now: Date): Promise<string[]> {
  const stored = await getShopeeSubId(ownerId).catch(() => null);
  const { date, time } = subIdDateTimeParts(now);
  const ctx = { date, time, platform: "threads", account, item };
  return normalizeSubIds(parseSubIdSlots(stored).map((slot) => resolveSubIdTemplate(slot, ctx)));
}

export interface RefreshResult {
  link: string;
  subId: string | null;
}

// 用乾淨商品連結重產分潤短連結。金鑰順序同 fromUrl/regen：Open API → affiliate_id 後備。
// 缺乾淨連結或都沒金鑰時拋錯（呼叫端轉成可讀訊息）。now 注入以利測試。
export async function refreshAffiliateLink(
  ownerId: string,
  opts: { cleanUrl: string | null | undefined; itemId?: string; accountTag?: string | null },
  now: Date = new Date()
): Promise<RefreshResult> {
  const cleanUrl = opts.cleanUrl?.trim();
  if (!cleanUrl) throw new Error("缺少乾淨商品連結，無法刷新分潤連結");
  const subIds = await resolveUserSubIds(ownerId, opts.itemId ?? "", opts.accountTag ?? "", now);

  const creds = await getShopeeCredentials(ownerId);
  if (creds) {
    const link = await generateAffiliateLink(creds.appId, creds.secret, cleanUrl, subIds);
    return { link, subId: subIds.join(",") || null };
  }
  const affiliateId = await getShopeeAffiliateId(ownerId);
  if (affiliateId) {
    return { link: buildAffiliateRedirectLink(cleanUrl, affiliateId, subIds), subId: subIds.join("-") || null };
  }
  throw new Error("未綁定 Shopee 金鑰或 affiliate_id，無法刷新分潤連結");
}

// 從乾淨商品連結（…/product/<shopId>/<itemId>）抽 itemId，供 {item} 範本代換與顯示。抽不到回 ""。
export function itemIdFromCleanUrl(url: string | null | undefined): string {
  return (url ?? "").match(/\/product\/\d+\/(\d+)/)?.[1] ?? "";
}
