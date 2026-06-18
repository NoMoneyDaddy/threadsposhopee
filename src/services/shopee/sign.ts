import crypto from "node:crypto";

// Shopee 分潤 Open API 簽章（自建，取代 n8n 流程裡的外部 Zeabur 簽名服務）。
// 規則：signature = SHA256(appId + timestamp + payload + secret) 的 hex。
// Header: Authorization: SHA256 Credential=<appId>, Timestamp=<ts>, Signature=<sig>
export function buildShopeeAuth(appId: string, secret: string, payload: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHash("sha256")
    .update(appId + timestamp + payload + secret)
    .digest("hex");
  return {
    timestamp,
    signature,
    // 格式對齊 shopee-signer-zeabur（逗號後不留空格）
    authorization: `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`
  };
}
