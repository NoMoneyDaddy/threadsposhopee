import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardStats, listActiveThreadsCredentials } from "@/lib/store";
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

  const stats = await getDashboardStats();

  // 以下為 owner 限定的即時外部查詢
  let threadsQuota: { label: string; used: number; limit: number }[] = [];
  let cloudinary = null;
  if (isOwner) {
    const [creds, usage] = await Promise.all([
      listActiveThreadsCredentials().catch(() => []),
      getCloudinaryUsage().catch(() => null)
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

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    isOwner,
    demo: isDemoMode,
    services,
    stats,
    threadsQuota,
    cloudinary
  });
}
