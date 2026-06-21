// 定期績效摘要（週／月）：把區間內發布量、各帳號分項、熱門商品與分潤收益打包成一則訊息，
// 由總排程定期推到 Telegram，讓操作者免登入也能掌握較長週期的趨勢。
import { env, isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";
import { getOwnerUserId } from "@/lib/auth";
import { getPublishInsights } from "@/lib/store";
import { getAffiliateRevenue } from "@/services/shopee/report";

export interface PeriodicDigestInput {
  label: string; // 例：本週、本月
  days: number;
  totalPublished: number;
  byAccount: { name: string; count: number }[];
  byProduct: { name: string; count: number }[];
  revenue: { commission: number; conversions: number } | null;
}

const n = (x: number) => x.toLocaleString("zh-TW");

// 純函式：組摘要文字（Telegram 友善）。
export function composePeriodicDigest(d: PeriodicDigestInput): string {
  const lines: string[] = [`📈 ${d.label}績效摘要（近 ${d.days} 天，Asia/Taipei）`];
  lines.push(`• 已發布：${n(d.totalPublished)} 篇`);
  if (d.byAccount.length) {
    lines.push("• 各帳號發布：");
    for (const a of d.byAccount.slice(0, 8)) lines.push(`   - ${a.name}：${n(a.count)} 篇`);
  }
  if (d.byProduct.length) {
    lines.push("• 熱門商品：");
    for (const p of d.byProduct.slice(0, 5)) lines.push(`   - ${p.name}（${n(p.count)} 篇）`);
  }
  if (d.revenue) {
    lines.push(`• 分潤收益：NT$ ${d.revenue.commission.toFixed(2)}（${n(d.revenue.conversions)} 筆轉換）`);
  }
  return lines.join("\n");
}

// 蒐集 owner 區間資料並組摘要；無 owner 或取資料失敗回 null（由呼叫端略過發送）。
export async function buildPeriodicDigest(label: string, days: number): Promise<string | null> {
  const ownerId = await getOwnerUserId();
  if (!ownerId) return null;
  const endMs = Date.now();
  const startMs = endMs - days * 86400_000;
  const insights = await getPublishInsights(ownerId, { startMs, endMs }).catch((e) => {
    log.error("定期摘要 getPublishInsights 失敗", { ownerId, err: e });
    return null;
  });
  if (!insights) return null;

  let revenue: { commission: number; conversions: number } | null = null;
  if (!isDemoMode && env.shopeeAppId && env.shopeeSecret) {
    const r = await getAffiliateRevenue({ startMs, endMs }).catch(() => null);
    if (r) revenue = { commission: r.totalCommission, conversions: r.totalConversions };
  }

  return composePeriodicDigest({
    label,
    days,
    totalPublished: insights.totalPublished,
    byAccount: insights.byAccount,
    byProduct: insights.byProduct,
    revenue
  });
}
