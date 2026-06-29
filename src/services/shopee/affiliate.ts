import { log } from "@/lib/logger";
import { callShopeeGql, ShopeeApiError } from "./gql";
import { normalizeSubId } from "./subid";

export { ShopeeApiError }; // 向後相容：原本由本檔匯出

// 共用 Shopee GraphQL 呼叫；payload 由物件序列化，簽名位元組與原本一致（8s 預設逾時）。
async function callShopee(appId: string, secret: string, body: object): Promise<any> {
  return callShopeeGql(appId, secret, JSON.stringify(body));
}

// 綁定即驗證：用一筆最小讀取查詢確認 AppID／Secret 簽章有效。
// 分類：明確授權錯誤（HTTP 401/403 或簽章類訊息）→ 擋下；
//       已知第三方/網路錯誤 → 放行並記 log（不因第三方故障卡住）；
//       真正非預期錯誤（程式 bug）→ 上拋，由路由轉 500，不誤判為驗證通過。
export async function validateShopeeCredentials(
  appId: string,
  secret: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    await callShopee(appId, secret, { query: "query{productOfferV2(limit:1){nodes{productName}}}" });
    return { ok: true };
  } catch (e) {
    const status = e instanceof ShopeeApiError ? e.status : undefined;
    const msg = e instanceof Error ? e.message : String(e);
    if (status === 401 || status === 403 || /signature|credential|authoriz|unauthor|invalid app/i.test(msg)) {
      return { ok: false, reason: "Shopee AppID／Secret 無效（驗證被拒）" };
    }
    // 已知第三方/網路錯誤（含非授權 GraphQL 錯誤）放行但記 log；其餘非預期錯誤上拋
    if (e instanceof ShopeeApiError || /network|fetch|timeout|abort|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(msg)) {
      log.warn("Shopee 憑證驗證無法確認，放行存檔", { err: msg });
      return { ok: true };
    }
    throw e;
  }
}

// 組出帶追蹤識別的 subIds（最多 5 個）：base + 來源帳號 + 商品 item_id。
// 蝦皮分潤報表會依 subId 分流統計，可看出哪個來源/商品帶來收益。
// subId 僅允許英數（實測底線會被蝦皮拒收），需清洗（來源含 @、底線、商品名含中文/空白都不適合）。
export function buildSubIds(base: string | null | undefined, sourceUsername: string, itemId: string): string[] {
  // 不再注入預設 base（原 "threadspo"）：未設來源標記時就不帶 base，只留來源/商品。
  const parts = [normalizeSubId(base), normalizeSubId(sourceUsername), normalizeSubId(itemId)];
  return parts.filter((p) => p.length > 0);
}

// 無 Open API 的替代：依蝦皮官方「Product Feed 第三方短連結」做法，
// 直接組 an_redir 轉址連結帶上 affiliate_id 與 sub_id（最多 5 個、用 - 連接）。
// 只要使用者的 affiliate_id 即可追蹤分潤，免申請 API 金鑰。
// 參考：help.shopee.tw 文章 172901。
export function buildAffiliateRedirectLink(originUrl: string, affiliateId: string, subIds: string[] = []): string {
  const u = new URL("https://s.shopee.tw/an_redir");
  u.searchParams.set("origin_link", originUrl);
  u.searchParams.set("affiliate_id", affiliateId);
  const subs = subIds.filter(Boolean).slice(0, 5);
  if (subs.length) u.searchParams.set("sub_id", subs.join("-"));
  return u.toString();
}

// 產生帶自己 subId 的分潤短連結（對應 n8n「取得分潤連結」）
export async function generateAffiliateLink(
  appId: string,
  secret: string,
  originUrl: string,
  subIds: string[]
): Promise<string> {
  const query =
    "mutation generateShortLink($originUrl: String!, $subIds: [String!]){generateShortLink(input:{originUrl:$originUrl, subIds:$subIds}){shortLink}}";
  const data = await callShopee(appId, secret, { query, variables: { originUrl, subIds } });
  return data.generateShortLink.shortLink as string;
}

// 取商品資訊（productOfferV2）：商品名稱 + 目前分潤率（顯示用，不做選品過濾）。
// commissionRate 為字串小數（如 "0.05"＝5%）；隨時間變動，呼叫端應記查詢時間。
// 注意：schema 雖宣告 shopId/itemId 為 Int64，但 Shopee API 實際要求「字串」格式——
// 傳數字會被回「wrong type」。故 variables 一律用 String()（參考自有可運作的 shopee bot 實作）。
export async function getProductInfo(
  appId: string,
  secret: string,
  shopId: string,
  itemId: string
): Promise<{ productName: string | null; commissionRate: string | null }> {
  const query =
    "query productOfferV2($shopId: Int64, $itemId: Int64){productOfferV2(shopId:$shopId, itemId:$itemId, limit:1){nodes{productName commissionRate}}}";
  const data = await callShopee(appId, secret, {
    query,
    variables: { shopId: String(shopId), itemId: String(itemId) }
  });
  const node = data?.productOfferV2?.nodes?.[0];
  return { productName: node?.productName ?? null, commissionRate: node?.commissionRate ?? null };
}
