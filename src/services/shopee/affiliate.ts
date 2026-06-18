import { buildShopeeAuth } from "./sign";

const SHOPEE_GQL = "https://open-api.affiliate.shopee.tw/graphql";

async function callShopee(appId: string, secret: string, body: object): Promise<any> {
  const payload = JSON.stringify(body);
  const auth = buildShopeeAuth(appId, secret, payload);
  const res = await fetch(SHOPEE_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth.authorization },
    body: payload
  });
  if (!res.ok) throw new Error(`Shopee API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Shopee GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// 組出帶追蹤識別的 subIds（最多 5 個）：base + 來源帳號 + 商品 item_id。
// 蝦皮分潤報表會依 subId 分流統計，可看出哪個來源/商品帶來收益。
// subId 僅允許英數，需清洗（來源含 @、商品名含中文/空白都不適合）。
export function buildSubIds(base: string | null | undefined, sourceUsername: string, itemId: string): string[] {
  const san = (s: string | null | undefined) => (s ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 50);
  const parts = [san(base) || "threadspo", san(sourceUsername), san(itemId)];
  return parts.filter((p) => p.length > 0);
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
