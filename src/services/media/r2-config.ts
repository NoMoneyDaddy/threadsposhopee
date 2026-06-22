// 各人自綁 Cloudflare R2 的輸入驗證（純函式，可測）。
// accountId 空＝清除整組；非空時 bucket 與 publicBase 必填（account/secret 留空＝沿用既有，故不在此強制）。
export type R2InputResult =
  | { ok: true; accountId: string | null; bucket: string | null; publicBase: string | null }
  | { ok: false; error: string };

const ACCOUNT_RE = /^[a-zA-Z0-9]{16,64}$/; // Cloudflare account id（通常 32 hex）
const BUCKET_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/; // R2/S3 bucket 命名

export function parseR2Input(raw: {
  accountId?: unknown;
  bucket?: unknown;
  publicBase?: unknown;
}): R2InputResult {
  if (typeof raw.accountId !== "string") return { ok: false, error: "缺少或型別錯誤的 account id" };
  const accountId = raw.accountId.trim();
  if (!accountId) return { ok: true, accountId: null, bucket: null, publicBase: null }; // 清除

  if (!ACCOUNT_RE.test(accountId)) return { ok: false, error: "account id 格式不正確（英數 16–64 字）" };

  const bucket = typeof raw.bucket === "string" ? raw.bucket.trim() : "";
  const publicBaseRaw = typeof raw.publicBase === "string" ? raw.publicBase.trim() : "";
  if (!bucket) return { ok: false, error: "請填寫 bucket 名稱" };
  if (!BUCKET_RE.test(bucket)) return { ok: false, error: "bucket 名稱格式不正確（小寫英數與連字號，3–63 字）" };
  if (!publicBaseRaw) return { ok: false, error: "請填寫公開讀網域（public base URL）" };

  let publicBase: string;
  try {
    const u = new URL(publicBaseRaw);
    if (u.protocol !== "https:") return { ok: false, error: "公開讀網域必須是 https://" };
    publicBase = u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return { ok: false, error: "公開讀網域不是合法網址" };
  }

  return { ok: true, accountId, bucket, publicBase };
}
