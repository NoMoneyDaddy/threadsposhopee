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

// 從序列化的 payload 取 GraphQL 操作名（query/mutation 後的名字），讓錯誤訊息標出「是哪個查詢失敗」，
// 方便排查（例如 generateShortLink＝換分潤連結失敗 vs productOfferV2＝查商品資訊失敗）。
function operationName(payload: string): string {
  try {
    const q = (JSON.parse(payload) as { query?: unknown })?.query;
    if (typeof q !== "string") return "";
    return q.match(/\b(?:query|mutation)\s+([A-Za-z0-9_]+)/)?.[1] ?? "";
  } catch {
    return "";
  }
}

// 吃「已序列化」的 payload 字串：簽名是對 payload 算的，傳字串確保簽名位元組與呼叫端一致。
// 回傳 json.data（含 conversionReport / productOfferV2 / generateShortLink 等子欄位）。
export async function callShopeeGql(appId: string, secret: string, payload: string, timeoutMs = 8000): Promise<any> {
  const auth = buildShopeeAuth(appId, secret, payload);
  const op = operationName(payload);
  const opTag = op ? `（${op}）` : "";
  assertSafePublicUrl(SHOPEE_GQL); // SSRF 防護：外部 fetch 前一律驗證 URL
  // 只重試 429（rate limited、請求未被處理）；簽名含 timestamp 但 16s 退避封頂遠小於有效期，安全。
  const res = await fetchWithRetry(
    SHOPEE_GQL,
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth.authorization }, body: payload },
    timeoutMs
  );
  if (!res.ok) {
    // 上游回應本文只進 log（截斷 500 字避免長回應/echo 灌爆 log），對外僅保留狀態碼。
    log.error("Shopee API 非 2xx", { op, status: res.status, body: (await res.text()).slice(0, 500) });
    throw new ShopeeApiError(`Shopee API 錯誤${opTag}（${res.status}）`, res.status);
  }
  const json = await res.json();
  if (json.errors?.length) {
    log.error("Shopee GraphQL error", { op, errors: json.errors });
    // 只取各 error 的 message（API 錯誤描述，如「Invalid Signature」，非機密且利於使用者修金鑰），
    // 不 dump 整包 json.errors（可能含內部欄位）。呼叫端據此分類授權/簽章錯誤。
    const detail = json.errors
      .map((x: { message?: string }) => x?.message)
      .filter(Boolean)
      .join("; ");
    throw new ShopeeApiError(`Shopee 查詢失敗${opTag}：${detail}`);
  }
  return json.data;
}
