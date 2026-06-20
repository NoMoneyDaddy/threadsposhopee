import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert } from "@/lib/notify";
import { runAllSources } from "@/services/pipeline/run";
import { runPublishQueue } from "@/services/publish/queue";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { buildDailyDigest } from "@/services/digest/daily";
import { getOwnerUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { setHeartbeat } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 全自動「總排程」：一條 Zeabur Cron（建議每 15 分）打這支就好，全傻瓜。
// 每次都跑：爬取產草稿 + 發文佇列。
// 每天 03:0x：Threads token 展期。每週一 04:0x：連結健檢。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;

  const now = new Date();
  const h = now.getUTCHours();
  const min = now.getUTCMinutes();
  const dow = now.getUTCDay(); // 0=日, 1=一
  const out: Record<string, unknown> = { ranAt: now.toISOString() };
  const alerts: string[] = [];

  // 用 allSettled，單一步驟失敗不影響其他步驟
  const steps: { key: string; run: () => Promise<unknown>; warn?: (r: any) => string | null }[] = [
    { key: "scrape", run: runAllSources },
    {
      key: "publish",
      run: runPublishQueue,
      warn: (r) => {
        const parts: string[] = [];
        if (r?.failed?.length) parts.push(`發文 ${r.failed.length} 則失敗`);
        if (r?.replies?.failed) parts.push(`補留言 ${r.replies.failed} 則失敗`);
        return parts.length ? `⚠️ ${parts.join("；")}` : null;
      }
    }
  ];
  // 每天展期一次（03:00–03:14 視窗，避免每 15 分重複）
  if (h === 3 && min < 15) {
    steps.push({ key: "refreshTokens", run: refreshExpiringTokens, warn: (r) => (r?.failed ? `⚠️ Token 展期 ${r.failed} 個失敗` : null) });
  }
  // 每週一健檢一次（04:00–04:14）
  if (dow === 1 && h === 4 && min < 15) {
    steps.push({
      key: "checkLinks",
      run: async () => checkAffiliateLinks(await getOwnerUserId()),
      warn: (r) => (r?.revived || r?.dead ? `🔗 連結重產 ${r.revived ?? 0}、仍失效 ${r.dead ?? 0}` : null)
    });
  }
  // 每日成效摘要（台北 09:00 = UTC 01:00–01:14），僅在有設 Telegram 時才組（省 API）
  if (h === 1 && min < 15 && env.telegramBotToken && env.telegramChatId) {
    steps.push({
      key: "dailyDigest",
      run: async () => {
        const msg = await buildDailyDigest();
        if (msg) await sendAlert(msg);
        return { sent: Boolean(msg) };
      }
    });
  }

  for (const s of steps) {
    try {
      const r = await s.run();
      out[s.key] = r;
      const w = s.warn?.(r);
      if (w) alerts.push(w);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out[s.key] = { error: msg };
      alerts.push(`❌ ${s.key} 失敗：${msg}`);
    }
  }

  await setHeartbeat().catch(() => {});
  if (alerts.length) await sendAlert(`自動排程：${alerts.join("；")}`);
  return NextResponse.json({ ok: true, ...out });
}
