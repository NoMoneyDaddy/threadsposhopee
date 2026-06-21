import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { getPublishInsights } from "@/lib/store";
import { getAffiliateRevenue } from "@/services/shopee/report";
import { resolveInsightsRange } from "@/lib/insights-range";
import { csvCell as cell, csvRows as rows } from "@/lib/csv";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 台北時區日期（YYYY-MM-DD）。en-CA 輸出 ISO 形式，避免用 UTC 造成跨日偏差。
function taipeiDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
}

// 成效報表 CSV 匯出（依目前區間）。發布數據為自家資料；分潤收益僅 owner 且有金鑰時附上（best-effort）。
export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return new Response("unauthorized", { status: 401 });

    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const { startMs, endMs, label } = resolveInsightsRange(sp);
    const data = await getPublishInsights(user.id, { startMs, endMs });

    const sections: string[] = [];
    sections.push(`成效報表,${label}`);
    sections.push(`已發布總數,${data.totalPublished}`);
    sections.push("");
    sections.push("每日發布量");
    sections.push("日期,篇數");
    sections.push(rows(data.byDay, ["date", "count"]));
    sections.push("");
    sections.push("各帳號發布次數");
    sections.push("帳號,篇數");
    sections.push(rows(data.byAccount, ["name", "count"]));
    sections.push("");
    sections.push("熱門商品");
    sections.push("商品,篇數");
    sections.push(rows(data.byProduct, ["name", "count"]));
    sections.push("");
    sections.push("來源貢獻");
    sections.push("來源,篇數");
    sections.push(rows(data.bySource, ["name", "count"]));

    // 分潤收益（owner 限定，失敗則略過、不擋匯出）
    if (user.isOwner && !isDemoMode && env.shopeeAppId && env.shopeeSecret) {
      const rev = await getAffiliateRevenue({ startMs, endMs }).catch((e) => {
        log.warn("匯出分潤收益失敗，略過", { err: e instanceof Error ? e.message : e });
        return null;
      });
      if (rev) {
        sections.push("");
        sections.push("分潤收益");
        sections.push(`總佣金,${rev.totalCommission}`);
        sections.push(`轉換筆數,${rev.totalConversions}`);
        sections.push("");
        sections.push("收益來源（subId / utm）");
        sections.push("subId,佣金,筆數");
        sections.push(rev.bySubId.map((s) => [cell(s.subId), s.commission, s.count].join(",")).join("\n"));
      }
    }

    // 前置 BOM 讓 Excel 正確辨識 UTF-8 中文；用顯式 ﻿ 轉義避免被格式化工具吃掉。
    const csv = "\ufeff" + sections.join("\n") + "\n";
    const fname = `insights_${taipeiDate(startMs)}_${taipeiDate(endMs)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fname}"`
      }
    });
  } catch (e) {
    log.error("匯出成效 CSV 失敗", { err: e });
    return new Response("伺服器暫時無法處理，請稍後再試", { status: 500 });
  }
}
