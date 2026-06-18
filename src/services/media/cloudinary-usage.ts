import { env } from "@/lib/env";

export interface CloudinaryUsage {
  creditsUsed: number;
  creditsLimit: number;
  storageBytes: number;
  resources: number;
}

// 查 Cloudinary 用量（需設定 CLOUDINARY_API_KEY/SECRET，未設定回 null）。
export async function getCloudinaryUsage(): Promise<CloudinaryUsage | null> {
  if (!env.cloudinaryCloud || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) return null;
  try {
    const auth = Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64");
    const res = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinaryCloud}/usage`, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store"
    });
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
