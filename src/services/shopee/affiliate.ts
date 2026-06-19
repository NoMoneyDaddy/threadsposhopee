import { buildShopeeAuth } from "./sign";
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";

const SHOPEE_GQL = "https://open-api.affiliate.shopee.tw/graphql";

// 帶結構化欄位的 Shopee 錯誤：讓呼叫端依 HTTP 狀態判斷，而非脆弱地比對訊息字串。
export class ShopeeApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ShopeeApiError";
    this.status = status;
  }
}

async function callShopee(appId: string, secret: string, body: object): Promise<any> {
  const payload = JSON.stringify(body);
  const auth = buildShopeeAuth(appId, secret, payload);
  assertSafePublicUrl(SHOPEE_GQL); // SSRF 防護：外部 fetch 前一律驗證 URL
  const res = await fetchWithTimeout(SHOPEE_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth.authorization },
    body: payload
  });
  if (!res.ok) throw new ShopeeApiError(`Shopee API ${res.status}: ${await res.text()}`, res.status);
  const json = await res.json();
  if (json.errors?.length) throw new ShopeeApiError(`Shopee GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
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
      console.warn("Shopee 憑證驗證無法確認，放行存檔：", msg);
      return { ok: true };
    }
    throw e;
  }
}

// 組出帶追蹤識別的 subIds（最多 5 個）：base + 來源帳號 + 商品 item_id。
// 蝦皮分潤報表會依 subId 分流統計，可看出哪個來源/商品帶來收益。
// subId 僅允許英數，需清洗（來源含 @、商品名含中文/空白都不適合）。
export function buildSubIds(base: string | null | undefined, sourceUsername: string, itemId: string): string[] {
  const san = (s: string | null | undefined) => (s ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 50);
  const parts = [san(base) || "threadspo", san(sourceUsername), san(itemId)];
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

// 取商品名稱（對應 n8n「取得商品名稱」productOfferV2）
export async function getProductName(
  appId: string,
  secret: string,
  shopId: string,
  itemId: string
): Promise<string | null> {
  const query =
    "query productOfferV2($shopId: Int64, $itemId: Int64){productOfferV2(shopId:$shopId, itemId:$itemId, limit:1){nodes{productName}}}";
  const data = await callShopee(appId, secret, {
    query,
    variables: { shopId: Number(shopId), itemId: Number(itemId) }
  });
  return data?.productOfferV2?.nodes?.[0]?.productName ?? null;
}
