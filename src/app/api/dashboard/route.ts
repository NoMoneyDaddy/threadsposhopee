import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDashboardStats,
  listActiveThreadsCredentials,
  getHeartbeat,
  hasApifyCredentials,
  hasGeminiKey,
  getShopeeCredentials
} from "@/lib/store";
import { getPublishingLimit } from "@/services/threads/limit";
import { getCloudinaryUsage } from "@/services/media/cloudinary-usage";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const user = await getCurrentUser();
  if (!isDemoMode && !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const isOwner = user?.isOwner ?? isDemoMode;

  // 連接服務健康狀態（依設定判斷）
  const services = {
    supabase: !isDemoMode,
    gemini: Boolean(env.geminiApiKey) || isDemoMode,
    apify: Boolean(env.apifyToken),
    shopee: Boolean(env.shopeeAppId && env.shopeeSecret),
    cloudinary: Boolean(env.cloudinaryCloud),
    ai_provider: env.aiProvider
  };

  const ownerId = user?.id ?? "demo-user";
  const stats = await getDashboardStats(ownerId);

  // Threads 額度查每個登入者自己的帳號；Cloudinary 用量僅 owner（共用帳號）
  let threadsQuota: { label: string; used: number; limit: number }[] = [];
  let cloudinary = null;
  {
    const [creds, usage] = await Promise.all([
      listActiveThreadsCredentials(ownerId).catch(() => []),
      isOwner ? getCloudinaryUsage().catch(() => null) : Promise.resolve(null)
    ]);
    cloudinary = usage;
    threadsQuota = (
      await Promise.all(
        creds.map(async (c) => {
          const lim = await getPublishingLimit(c.threadsUserId, c.accessToken);
          return lim ? { label: c.label, used: lim.used, limit: lim.limit } : null;
        })
      )
    ).filter((x): x is { label: string; used: number; limit: number } => x !== null);
  }

  const lastCronAt = await getHeartbeat().catch(() => null);

  // 金鑰自綁狀態（提示用）。owner 與 member 規則不同：
  // - Apify（爬蟲）只有 owner 需要；member 不適用 → 視為 OK 不嘮叨。
  // - Gemini（AI）每人都需要，自綁或 env 後備皆可。
  // - Shopee（分潤）owner 需要（自綁或 env）；member 為選填（可貼現成分潤連結）→ 視為 OK。
  let binds: { apify: boolean; gemini: boolean; shopee: boolean } | null = null;
  if (!isDemoMode && user) {
    const [apify, gemini, shopee] = await Promise.all([
      isOwner
        ? hasApifyCredentials(user.id).then((r) => r.bound || Boolean(env.apifyToken)).catch(() => false)
        : Promise.resolve(true),
      hasGeminiKey(user.id).then((b) => b || Boolean(env.geminiApiKey)).catch(() => false),
      isOwner
        ? getShopeeCredentials(user.id).then((c) => Boolean(c) || Boolean(env.shopeeAppId && env.shopeeSecret)).catch(() => false)
        : Promise.resolve(true)
    ]);
    binds = { apify, gemini, shopee };
  }

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    isOwner,
    demo: isDemoMode,
    services,
    stats,
    threadsQuota,
    cloudinary,
    lastCronAt,
    binds
  });
}
