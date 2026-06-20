// Shopee 分潤 Open API（GraphQL）共用呼叫：HMAC 簽名 → SSRF 守衛 → 帶逾時 POST → 錯誤分類。
// affiliate（連結/商品名/驗證）與 report（轉換報表）共用，避免兩份重複（並確保兩邊都過 SSRF 守衛）。
import { buildShopeeAuth } from "./sign";
import { fetchWithRetry } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { log } from "@/lib/logger";

export const SHOPEE_GQL = "https://open-api.affiliate.shopee.tw/graphql";

// 帶結構化欄位的 Shopee 錯誤：讓呼叫端依 HTTP 狀態判斷，而非脆弱地比對訊息字串。
export class ShopeeApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ShopeeApiError";
    this.status = status;
  }
}

// 吃「已序列化」的 payload 字串：簽名是對 payload 算的，傳字串確保簽名位元組與呼叫端一致。
// 回傳 json.data（含 conversionReport / productOfferV2 / generateShortLink 等子欄位）。
export async function callShopeeGql(appId: string, secret: string, payload: string, timeoutMs = 8000): Promise<any> {
  const auth = buildShopeeAuth(appId, secret, payload);
  assertSafePublicUrl(SHOPEE_GQL); // SSRF 防護：外部 fetch 前一律驗證 URL
  // 只重試 429（rate limited、請求未被處理）；簽名含 timestamp 但 16s 退避封頂遠小於有效期，安全。
  const res = await fetchWithRetry(
    SHOPEE_GQL,
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.authorization }, body: payload },
    timeoutMs
  );
  if (!res.ok) {
    // 上游回應本文只進 log，對外訊息僅保留狀態碼避免洩漏供應商細節。
    log.error("Shopee API 非 2xx", { status: res.status, body: await res.text() });
    throw new ShopeeApiError(`Shopee API 錯誤（${res.status}）`, res.status);
  }
  const json = await res.json();
  if (json.errors?.length) {
    log.error("Shopee GraphQL error", { errors: json.errors });
    // 只取各 error 的 message（API 錯誤描述，如「Invalid Signature」，非機密且利於使用者修金鑰），
    // 不 dump 整包 json.errors（可能含內部欄位）。呼叫端據此分類授權/簽章錯誤。
    const detail = json.errors
      .map((x: { message?: string }) => x?.message)
      .filter(Boolean)
      .join("; ");
    throw new ShopeeApiError(`Shopee 查詢失敗：${detail}`);
  }
  return json.data;
}
