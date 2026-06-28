// Cloudflare R2 圖床（S3 相容）：把來源媒體中轉到使用者自綁的 R2 bucket，回傳「公開讀」物件網址。
// 與 Cloudinary 二擇一；憑證（access key/secret）只在 server 用、加密存、不外露。
// 分享素材時共享的是公開物件 URL（唯讀），不涉及寫入/刪除權限，故不需要第二把 key。
//
// 簽章：AWS Signature V4（service=s3、region=auto）。用 x-amz-content-sha256: UNSIGNED-PAYLOAD
// （R2 走 HTTPS 允許），免緩衝整檔做雜湊。簽章組裝為純函式，便於單測（注入 amzDate）。
import { createHash, createHmac, randomBytes } from "node:crypto";
import { fetchWithRetry, fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { log } from "@/lib/logger";

export type R2Creds = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string; // 公開讀網域（r2.dev 或自訂網域），回傳網址用
};

const UNSIGNED = "UNSIGNED-PAYLOAD";

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

// AWS SigV4 簽章金鑰推導：HMAC 鏈（date→region→service→"aws4_request"）。可對 AWS 官方測試向量驗證。
export function deriveSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

// 組 S3 PUT 的 Authorization 標頭（純函式）。host 為 R2 端點主機，path 為 /<bucket>/<key>（已編碼）。
export function buildS3PutAuth(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  host: string;
  canonicalPath: string;
  amzDate: string; // YYYYMMDDTHHMMSSZ
  contentType: string;
}): { authorization: string; amzDate: string } {
  const { accessKeyId, secretAccessKey, region, host, canonicalPath, amzDate, contentType } = opts;
  const service = "s3";
  const dateStamp = amzDate.slice(0, 8);
  // 簽入 content-type、host、x-amz-content-sha256、x-amz-date（依字母序）。
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${UNSIGNED}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalPath,
    "", // 無 query
    canonicalHeaders,
    signedHeaders,
    UNSIGNED
  ].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, amzDate };
}

// accountId 格式守衛（英數 16–64，與設定頁 ACCOUNT_RE 一致）：防 `/`、`@` 等 authority 字元竄改 host，
// 把帶簽章請求送到非預期主機（SSRF）。assertSafePublicUrl 只擋非公開目標，故簽章前先過這層。
const R2_ACCOUNT_RE = /^[a-zA-Z0-9]{16,64}$/;

// 物件 key 的路徑分段編碼（保留 "/"，其餘 RFC3986 編碼）。
function encodeKeyPath(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

// R2 連線驗證的 HTTP 狀態 → 使用者訊息（純函式可測）。200 視為通過故不在此。
export function r2ValidationReason(status: number): string {
  if (status === 401 || status === 403) return "金鑰無效或無此 bucket 權限（請確認 Access Key/Secret 與 bucket 範圍）";
  if (status === 404) return "找不到 bucket（請確認 bucket 名稱與 Account ID）";
  return `R2 連線驗證失敗（HTTP ${status}）`;
}

// 組 HeadBucket 的 SigV4 Authorization（純函式）。HEAD 不簽 content-type，
// signedHeaders 為 host;x-amz-content-sha256;x-amz-date。便於單測（注入 amzDate）。
export function buildS3HeadAuth(opts: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  host: string;
  canonicalPath: string;
  amzDate: string;
}): { authorization: string; signedHeaders: string } {
  const { accessKeyId, secretAccessKey, region, host, canonicalPath, amzDate } = opts;
  const service = "s3";
  const dateStamp = amzDate.slice(0, 8);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = `host:${host}\n` + `x-amz-content-sha256:${UNSIGNED}\n` + `x-amz-date:${amzDate}\n`;
  const canonicalRequest = ["HEAD", canonicalPath, "", canonicalHeaders, signedHeaders, UNSIGNED].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, signedHeaders };
}

// 存檔前驗證 R2 憑證是否可用：對 bucket 發已簽章 HEAD（HeadBucket）。
// 回 {ok:true} 或 {ok:false, reason}。網路/逾時亦回 false（讓使用者知道沒驗成功）。
export async function validateR2(creds: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  // 嚴格限制 accountId（英數，與設定頁 ACCOUNT_RE 一致）：防 `/`、`@` 等 authority 字元竄改 host，
  // 把帶簽章的 HEAD 送到非預期主機（SSRF）。assertSafePublicUrl 只擋非公開目標，故這層額外把關。
  if (!R2_ACCOUNT_RE.test(creds.accountId)) return { ok: false, reason: "Cloudflare Account ID 格式不正確" };
  const host = `${creds.accountId}.r2.cloudflarestorage.com`;
  const canonicalPath = `/${encodeURIComponent(creds.bucket)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const { authorization } = buildS3HeadAuth({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region: "auto",
    host,
    canonicalPath,
    amzDate
  });
  const endpoint = `https://${host}${canonicalPath}`;
  try {
    // 外部請求一律走 fetchWithTimeout（專案規範）；驗證單發即可，不重試。
    const res = await fetchWithTimeout(
      assertSafePublicUrl(endpoint).href,
      { method: "HEAD", headers: { Authorization: authorization, "x-amz-date": amzDate, "x-amz-content-sha256": UNSIGNED } },
      8000
    );
    return res.ok ? { ok: true } : { ok: false, reason: r2ValidationReason(res.status) };
  } catch (e) {
    return { ok: false, reason: `R2 連線驗證失敗：${e instanceof Error ? e.message : String(e)}` };
  }
}

// 中轉一個媒體到 R2，回傳公開讀網址。失敗則拋錯（呼叫端 fallback 用原 URL）。
// 物件 key 命名：以商品分組（keyHint=<shopId>_<itemId>），檔名取來源媒體 id（同檔多尺寸/重複上傳會落同一 key，
// 可回溯、好清理）；無法取得來源 id 時退回 URL 雜湊；keyHint 缺時退回舊的 type 分類資料夾。
function sanitizeSeg(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}
function stableMediaName(sourceUrl: string): string {
  const id = sourceUrl.match(/\/(\d{6,})_\d+_\d+_n\./)?.[1];
  return id ?? createHash("sha1").update(sourceUrl).digest("hex").slice(0, 16);
}

function extFromContentType(contentType: string, type: "image" | "video"): string {
  return contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : type === "video" ? "mp4" : "jpg";
}

// 共用：把 bytes 以 SigV4 簽章 PUT 到 R2 的指定 key，回傳公開讀網址。失敗拋錯。
async function putObjectToR2(body: Buffer, contentType: string, key: string, creds: R2Creds): Promise<string> {
  // 簽章前重驗 accountId（舊資料/髒資料可能繞過綁定時的 validateR2），確保只把簽章 PUT 送到合法 R2 主機。
  if (!R2_ACCOUNT_RE.test(creds.accountId)) throw new Error("Cloudflare Account ID 格式不正確");
  const host = `${creds.accountId}.r2.cloudflarestorage.com`;
  const canonicalPath = `/${encodeURIComponent(creds.bucket)}/${encodeKeyPath(key)}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const { authorization } = buildS3PutAuth({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region: "auto",
    host,
    canonicalPath,
    amzDate,
    contentType
  });
  const endpoint = `https://${host}${canonicalPath}`;
  const res = await fetchWithRetry(
    assertSafePublicUrl(endpoint).href,
    {
      method: "PUT",
      headers: {
        Authorization: authorization,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": UNSIGNED,
        "content-type": contentType
      },
      // 零拷貝：以原 Buffer 底層 ArrayBuffer 視窗餵 fetch body（避免 Buffer<ArrayBufferLike> 型別不相容＋免再複製整檔）。
      body: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength)
    },
    20000
  );
  if (!res.ok) {
    log.error("R2 上傳失敗", { status: res.status, body: (await res.text()).slice(0, 500) });
    throw new Error(`R2 上傳失敗（${res.status}）`);
  }
  return `${creds.publicBase.replace(/\/+$/, "")}/${key}`;
}

export async function uploadToR2(
  sourceUrl: string,
  type: "image" | "video",
  creds: R2Creds,
  keyHint?: string
): Promise<string> {
  const safe = assertSafePublicUrl(sourceUrl);
  const src = await fetchWithRetry(safe.href, {}, 20000);
  if (!src.ok) throw new Error(`下載來源媒體失敗（${src.status}）`);
  const contentType = src.headers.get("content-type") || (type === "video" ? "video/mp4" : "image/jpeg");
  const body = Buffer.from(await src.arrayBuffer());
  const folder = keyHint ? sanitizeSeg(keyHint) : `${type}s`;
  const key = `threads/${folder}/${stableMediaName(sourceUrl)}.${extFromContentType(contentType, type)}`;
  return putObjectToR2(body, contentType, key, creds);
}

// 使用者本機上傳：直接把檔案 bytes 上傳到 R2（不經由來源 URL）。物件落 threads/uploads/<隨機>.ext。
export async function uploadBytesToR2(
  body: Buffer,
  contentType: string,
  type: "image" | "video",
  creds: R2Creds,
  keyHint?: string
): Promise<string> {
  const folder = keyHint ? sanitizeSeg(keyHint) : "uploads";
  const key = `threads/${folder}/${randomBytes(8).toString("hex")}.${extFromContentType(contentType, type)}`;
  return putObjectToR2(body, contentType, key, creds);
}
