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

// 從（展開後的）蝦皮網址抽出 shop_id / item_id：支援 /product/<shop>/<item> 與 i.<shop>.<item>
// 兩種格式，並先還原 &amp; 實體。純函式可測。
export function parseShopeeIds(url: string): { shopId: string; itemId: string } | null {
  const cleaned = url.replace(/&amp;/g, "&");
  const match = cleaned.match(/\/product\/(\d+)\/(\d+)/) ?? cleaned.match(/i\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { shopId: match[1], itemId: match[2] };
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
    // Location 可能是相對路徑（如 /product/...），以原連結為 base 解析回絕對 URL。
    const redirectUrl = res.headers.get("location");
    location = redirectUrl ? new URL(redirectUrl, safe.href).href : shortLink;
  } catch {
    // 網路失敗時退回原連結，仍嘗試從中解析
  }

  const ids = parseShopeeIds(location);
  if (!ids) return null;
  const { shopId, itemId } = ids;
  return {
    expandedUrl: location.replace(/&amp;/g, "&"),
    cleanUrl: `https://shopee.tw/product/${shopId}/${itemId}`,
    shopId,
    itemId
  };
}
