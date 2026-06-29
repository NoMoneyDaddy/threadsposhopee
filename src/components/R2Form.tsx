"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/http";
import BoundKeyHint from "@/components/BoundKeyHint";

// 各人自綁 Cloudflare R2 圖床（與 Cloudinary 二擇一）。
// 安全：分享素材時只共享「公開讀」物件網址（唯讀），寫入 token 只在 server 用、加密存、不外露，
// 故不需要第二把 key。建議把 R2 API token 限縮到「單一 bucket、Object Read & Write」。
export default function R2Form({
  bound,
  initialAccountId = "",
  initialBucket = "",
  initialPublicBase = ""
}: {
  bound: boolean;
  initialAccountId?: string;
  initialBucket?: string;
  initialPublicBase?: string;
}) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(initialAccountId);
  const [bucket, setBucket] = useState(initialBucket);
  const [publicBase, setPublicBase] = useState(initialPublicBase);
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithTimeout(
        "/api/accounts/r2",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: accountId.trim(),
            bucket: bucket.trim(),
            publicBase: publicBase.trim(),
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secret.trim()
          })
        },
        10000
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setMsg(accountId.trim() ? "✅ 已儲存" : "✅ 已清除");
      setAccessKeyId("");
      setSecret("");
      router.refresh();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-1 font-medium">
        圖片／影片存放（Cloudflare R2）
        {bound && <span className="ml-2 text-xs text-green-700">已綁定</span>}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        與 Cloudinary 二擇一（綁了 R2 則優先用 R2）。需 R2 的 <b>Account ID</b>、<b>bucket 名稱</b>、
        一組 <b>R2 API Token</b>（S3 相容的 Access Key ID／Secret），以及 bucket 的<b>公開讀網域</b>
        （r2.dev 或自訂網域）。建議 token 權限限縮到「單一 bucket、Object Read &amp; Write」。
        金鑰兩格留空的話，就沿用你原本綁好的（只更新網域）。詳細步驟見{" "}
        <a href="/guide#r2" className="text-brand underline">金鑰取得教學</a>。
      </p>
      <p className="mb-2 rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
        ⚠️ 建立 token 後，填下面兩格的是 <b>「針對 S3 用戶端」的認證</b>：<b>存取金鑰識別碼</b> → Access Key ID、
        <b>秘密存取金鑰</b> → Secret Access Key。<b>不是</b>最上方的「權杖值（cfat… / cfut…）」（那是 Cloudflare API 用、本服務用不到）。
        另外 token 權限要選 <b>Object Read &amp; Write（物件讀取和寫入）</b>——選成「物件唯讀」會無法上傳。
      </p>
      {bound && <BoundKeyHint label="目前已綁定 R2 Access Key／Secret" />}
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="input" aria-label="R2 Account ID" placeholder="Account ID" value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        <input className="input" aria-label="R2 bucket 名稱" placeholder="bucket 名稱（如 my-media）" value={bucket} onChange={(e) => setBucket(e.target.value)} />
        <input className="input" aria-label="R2 公開讀網域" placeholder="公開讀網域（https://…）" value={publicBase} onChange={(e) => setPublicBase(e.target.value)} />
        <span />
        <input className="input" type="password" aria-label="R2 Access Key ID" placeholder={bound ? "Access Key ID（留空＝不變更）" : "Access Key ID"} value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
        <input className="input" type="password" aria-label="R2 Secret Access Key" placeholder={bound ? "Secret（留空＝不變更）" : "Secret Access Key"} value={secret} onChange={(e) => setSecret(e.target.value)} />
      </div>
      <div className="mt-2">
        <button onClick={save} disabled={busy} className="btn btn-brand">
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
      {msg && <p className="mt-1 text-sm text-ink-2" role="status" aria-live="polite">{msg}</p>}
    </div>
  );
}
