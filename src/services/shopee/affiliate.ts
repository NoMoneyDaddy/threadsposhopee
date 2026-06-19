import { buildShopeeAuth } from "./sign";
import { fetchWithTimeout } from "@/lib/http";

const SHOPEE_GQL = "https://open-api.affiliate.shopee.tw/graphql";

async function callShopee(appId: string, secret: string, body: object): Promise<any> {
  const payload = JSON.stringify(body);
  const auth = buildShopeeAuth(appId, secret, payload);
  const res = await fetchWithTimeout(SHOPEE_GQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth.authorization },
    body: payload
  });
  if (!res.ok) throw new Error(`Shopee API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Shopee GraphQL error: ${JSON.stringify(json.errors)}`);
  return json.data;
}

// 綁定即驗證：用一筆最小讀取查詢確認 AppID／Secret 簽章有效。
// 僅在「明確授權／簽章錯誤」時擋下；網路錯誤或非授權錯誤一律放行（不因第三方故障卡住）。
export async function validateShopeeCredentials(
  appId: string,
  secret: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    await callShopee(appId, secret, { query: "query{productOfferV2(limit:1){nodes{productName}}}" });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/\b40[13]\b|signature|credential|authoriz|unauthor|invalid app/i.test(msg)) {
      return { ok: false, reason: "Shopee AppID／Secret 無效（驗證被拒）" };
    }
    // 非授權錯誤（網路／逾時／schema 變更）放行，但記 log 以利觀測，避免驗證默默失效
    console.warn("Shopee 憑證驗證無法確認，放行存檔：", msg);
    return { ok: true };
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
