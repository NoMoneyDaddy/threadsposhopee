// 還原蝦皮短網址 → 取出 shop_id / item_id → 組乾淨商品網址
// （對應 n8n「還原短網址」+「提取商品網址」節點）
import { isDemoMode } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

export interface ExpandedProduct {
  expandedUrl: string;
  cleanUrl: string;
  shopId: string;
  itemId: string;
}

export async function expandShopeeLink(shortLink: string): Promise<ExpandedProduct | null> {
  // Demo 模式不打網路，回固定假商品
  if (isDemoMode) {
    return {
      expandedUrl: shortLink,
      cleanUrl: "https://shopee.tw/product/123456/7891011",
      shopId: "123456",
      itemId: "7891011"
    };
  }

  // SSRF 防護：shortLink 來自使用者/爬蟲，fetch 前先驗證非內網位址、非法協定。
  // 不安全的連結不展開（直接回 null），不對內網發出任何請求。
  let safe: URL;
  try {
    safe = assertSafePublicUrl(shortLink);
  } catch {
    return null;
  }

  // 不自動跟隨重導，讀 Location header
  let location = shortLink;
  try {
    const res = await fetchWithTimeout(safe.href, { method: "GET", redirect: "manual" });
    location = res.headers.get("location") ?? shortLink;
  } catch {
    // 網路失敗時退回原連結，仍嘗試從中解析
  }

  const cleaned = location.replace(/&amp;/g, "&");
  const match = cleaned.match(/\/product\/(\d+)\/(\d+)/) ?? cleaned.match(/i\.(\d+)\.(\d+)/);
  if (!match) return null;

  const [, shopId, itemId] = match;
  return {
    expandedUrl: cleaned,
    cleanUrl: `https://shopee.tw/product/${shopId}/${itemId}`,
    shopId,
    itemId
  };
}
