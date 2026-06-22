export interface CloudinaryUsage {
  creditsUsed: number;
  creditsLimit: number;
  storageBytes: number;
  resources: number;
}

export interface CloudinaryUsageCreds {
  cloud: string;
  apiKey: string;
  apiSecret: string;
}

// 查 Cloudinary 用量（吃使用者自綁的完整金鑰；沒綁或缺欄位回 null）。
export async function getCloudinaryUsage(creds: CloudinaryUsageCreds | null): Promise<CloudinaryUsage | null> {
  if (!creds?.cloud || !creds.apiKey || !creds.apiSecret) return null;
  try {
    const auth = btoa(`${creds.apiKey}:${creds.apiSecret}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloud)}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const d = await res.json();
    return {
      creditsUsed: d?.credits?.usage ?? 0,
      creditsLimit: d?.credits?.limit ?? 0,
      storageBytes: d?.storage?.usage ?? 0,
      resources: d?.resources ?? 0
    };
  } catch {
    return null;
  }
}
