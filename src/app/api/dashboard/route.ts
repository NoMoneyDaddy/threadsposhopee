import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import {
  getDashboardStats,
  listActiveThreadsCredentials,
  listThreadsAccounts,
  getHeartbeat,
  hasApifyCredentials,
  hasGeminiKey,
  getShopeeCredentials,
  getUserCloudinary,
  getUserCloudinaryFull,
  getUserR2,
  getPublishPlan,
  isPublishPaused
} from "@/lib/store";
import { accountHealth, sortByHealth, type AccountHealth } from "@/lib/account-health";
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
  const ownerId = user?.id ?? "demo-user";

  // 各服務「自綁」狀態（驅動儀表板狀態標籤）：一律看每位使用者自己的綁定，不再用環境變數。
  // Apify／Shopee 僅 owner 需要 → member 視為 OK（true），不嘮叨。
  const [apifyBound, geminiBound, shopeeBound, cloudBound, cloudFull, r2Bound] = isDemoMode
    ? ([true, true, true, true, null, false] as const)
    : await Promise.all([
        isOwner ? hasApifyCredentials(ownerId).then((r) => r.bound).catch(() => false) : Promise.resolve(true),
        hasGeminiKey(ownerId).catch(() => false),
        isOwner ? getShopeeCredentials(ownerId).then((c) => Boolean(c)).catch(() => false) : Promise.resolve(true),
        getUserCloudinary(ownerId).then((c) => Boolean(c)).catch(() => false),
        getUserCloudinaryFull(ownerId).catch(() => null),
        getUserR2(ownerId).then((c) => Boolean(c)).catch(() => false)
      ]);

  const services = {
    supabase: !isDemoMode,
    gemini: geminiBound || isDemoMode,
    apify: apifyBound,
    shopee: shopeeBound,
    // 圖片影片空間：綁 R2 或 Cloudinary 任一即視為已連線（R2 優先，二擇一）。
    cloudinary: cloudBound || r2Bound || isDemoMode,
    ai_provider: env.aiProvider
  };

  const stats = await getDashboardStats(ownerId);

  // Threads 額度查每個登入者自己的帳號；Cloudinary 用量吃使用者自綁的完整金鑰（沒綁回 null）。
  let threadsQuota: { label: string; used: number; limit: number }[] = [];
  let cloudinary = null;
  {
    const [creds, usage] = await Promise.all([
      listActiveThreadsCredentials(ownerId).catch(() => []),
      getCloudinaryUsage(cloudFull).catch(() => null)
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
  const publishPaused = await isPublishPaused().catch(() => false);

  // 帳號健康分：每個 Threads 帳號的狀態＋token 到期彙整成單一等級（問題優先排序）。
  const accountsHealth: AccountHealth[] = sortByHealth(
    (await listThreadsAccounts(ownerId).catch(() => [])).map((a) => accountHealth(a))
  );

  // 發文進度/ETA：排隊中的草稿預計何時發（含塞車提示）。取前 20 筆即可。
  // 失敗不擋整個儀表板，但記 log 以利診斷（不靜默吞）。
  const publishPlan = (
    await getPublishPlan(ownerId).catch((e) => {
      log.error("getPublishPlan 失敗", { ownerId, err: e });
      return [];
    })
  ).slice(0, 20);

  // 金鑰自綁狀態（提示用）。一律看每人自綁，不再用 env 後備：
  // - Apify（爬蟲）只有 owner 需要；member 不適用 → 視為 OK 不嘮叨。
  // - Gemini（AI）每人都需要。
  // - Shopee（分潤）owner 需要；member 為選填（可貼現成分潤連結）→ 視為 OK。
  const binds =
    isDemoMode || !user ? null : { apify: apifyBound, gemini: geminiBound, shopee: shopeeBound };

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
    binds,
    publishPlan,
    publishPaused,
    accountsHealth
  });
}
