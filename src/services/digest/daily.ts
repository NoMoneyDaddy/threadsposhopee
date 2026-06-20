// 每日成效摘要：把昨日發布量、互動、熱門貼文、分潤收益與待辦提醒打包成一則訊息，
// 由總排程在每日固定時段推到 Telegram，讓操作者免登入就掌握脈動。
import { env, isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";
import { getOwnerUserId } from "@/lib/auth";
import { getDashboardStats, getGeminiKey } from "@/lib/store";
import { getEngagementCached } from "@/services/threads/engagement";
import { detectReachDrop } from "@/services/threads/reach";
import { getAffiliateRevenue } from "@/services/shopee/report";
import { summarizeInsights } from "./insight-summary";

export interface DailyDigestInput {
  publishedLast24h: number;
  approved: number; // 佇列待發
  draftsFailed: number;
  replyPending: number;
  replyFailed: number;
  invalidMaterials: number;
  tokenExpiring: number;
  topPosts: { name: string; views: number }[];
  engagementTotals: { views: number; likes: number } | null;
  revenue: { commission: number; conversions: number } | null;
  reachDrop: { recentMedian: number; baselineMedian: number; ratio: number } | null;
}

const n = (x: number) => x.toLocaleString("zh-TW");

// 純函式：組摘要文字（Telegram 友善）。
export function composeDailyDigest(d: DailyDigestInput): string {
  const lines: string[] = ["📊 每日成效摘要（Asia/Taipei）"];
  lines.push(`• 近 24h 已發布：${n(d.publishedLast24h)} 篇｜佇列待發：${n(d.approved)}`);
  if (d.engagementTotals) lines.push(`• 互動：👁 ${n(d.engagementTotals.views)}・♥ ${n(d.engagementTotals.likes)}`);
  if (d.topPosts.length) {
    lines.push("• 熱門貼文：");
    for (const p of d.topPosts) lines.push(`   - ${p.name}（👁 ${n(p.views)}）`);
  }
  if (d.revenue) lines.push(`• 分潤收益：NT$ ${d.revenue.commission.toFixed(2)}（${n(d.revenue.conversions)} 筆轉換）`);
  if (d.reachDrop)
    lines.push(
      `🚨 觸及驟降預警：近期中位觀看 ${n(d.reachDrop.recentMedian)}，僅基準 ${n(d.reachDrop.baselineMedian)} 的 ${Math.round(d.reachDrop.ratio * 100)}%（疑似被降觸及，建議放慢節奏）`
    );

  // 缺稿預警：近期還在發、但佇列已見底（0 待發）→ 提醒補稿，避免自動發文斷流。
  if (d.approved === 0 && d.publishedLast24h > 0) {
    lines.push("📭 佇列見底：目前 0 篇待發，請盡快補稿（核准草稿或常青回收），以免自動發文斷流。");
  }

  const warns: string[] = [];
  if (d.draftsFailed) warns.push(`發布失敗 ${n(d.draftsFailed)}`);
  if (d.replyPending) warns.push(`留言待補 ${n(d.replyPending)}`);
  if (d.replyFailed) warns.push(`留言失敗 ${n(d.replyFailed)}`);
  if (d.invalidMaterials) warns.push(`失效素材 ${n(d.invalidMaterials)}`);
  if (d.tokenExpiring) warns.push(`token 即將到期 ${n(d.tokenExpiring)}`);
  if (warns.length) lines.push(`⚠️ 需要注意：${warns.join("、")}`);

  return lines.join("\n");
}

// 蒐集 owner 的當日資料並組摘要；無 owner 或取資料失敗回 null（由呼叫端略過發送）。
export async function buildDailyDigest(): Promise<string | null> {
  const ownerId = await getOwnerUserId();
  if (!ownerId) return null;
  const stats = await getDashboardStats(ownerId).catch((e) => {
    log.error("每日摘要 getDashboardStats 失敗", { ownerId, err: e });
    return null;
  });
  if (!stats) return null;

  const eng = await getEngagementCached(ownerId).catch(() => null);
  const topPosts = eng ? eng.posts.slice(0, 3).map((p) => ({ name: p.productName ?? "（未命名）", views: p.views })) : [];
  const engagementTotals = eng && eng.fetched > 0 ? { views: eng.totals.views, likes: eng.totals.likes } : null;
  // 觸及驟降預警（防封訊號）：複用已抓的 insights，達樣本門檻且驟降才帶入摘要。
  const drop = eng && eng.fetched >= 6 ? detectReachDrop(eng.posts) : null;
  const reachDrop =
    drop && drop.hasSignal
      ? { recentMedian: drop.recentMedian, baselineMedian: drop.baselineMedian, ratio: drop.ratio }
      : null;

  let revenue: { commission: number; conversions: number } | null = null;
  if (!isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    const r = await getAffiliateRevenue(1).catch(() => null); // 近 1 天分潤
    if (r) revenue = { commission: r.totalCommission, conversions: r.totalConversions };
  }

  const input = {
    publishedLast24h: stats.publishedLast24h,
    approved: stats.drafts.approved,
    draftsFailed: stats.drafts.failed,
    replyPending: stats.replies.pending,
    replyFailed: stats.replies.failed,
    invalidMaterials: stats.invalidMaterials,
    tokenExpiring: stats.accountIssues.tokenExpiring,
    topPosts,
    engagementTotals,
    revenue,
    reachDrop
  };
  let digest = composeDailyDigest(input);

  // 成效歸因 AI 摘要（opt-in：DAILY_DIGEST_AI=1 且 owner 有 Gemini 金鑰）。失敗則略過、不擋摘要。
  if (env.dailyDigestAi && !isDemoMode) {
    const key = (await getGeminiKey(ownerId).catch(() => null)) || env.geminiApiKey;
    if (key) {
      const analysis = await summarizeInsights(input, key);
      if (analysis) digest += `\n\n🧠 AI 分析建議：\n${analysis}`;
    }
  }
  return digest;
}
