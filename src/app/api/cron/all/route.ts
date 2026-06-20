import { NextResponse } from "next/server";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert, sendUserAlert } from "@/lib/notify";
import { runAllSources } from "@/services/pipeline/run";
import { runPublishQueue } from "@/services/publish/queue";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { buildDailyDigest } from "@/services/digest/daily";
import { getOwnerUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { setHeartbeat, getUserTelegramChatId, getUserDiscordWebhook } from "@/lib/store";
import { log } from "@/lib/logger";

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
    {
      key: "scrape",
      run: runAllSources,
      // runAllSources 已 per-source 容錯（不拋）→ 在此偵測失敗來源並告警，補足爬蟲可見性。
      warn: (r) => {
        const failed = (Array.isArray(r) ? r : []).filter((x) => x?.error);
        return failed.length ? `🕷️ 爬取 ${failed.length} 個來源失敗：${failed.map((x) => x.sourceUsername).join("、")}` : null;
      }
    },
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
  // 每日成效摘要（台北 09:00 = UTC 01:00–01:14）。
  // 有「全域 ops 通道」或 owner「個人通道」任一存在才組（省 API）；組好後優先送個人通道，
  // 否則退回全域 ops 通道（避免同一人收到兩份）。個人 Telegram 仍需全域 bot token。
  if (h === 1 && min < 15) {
    steps.push({
      key: "dailyDigest",
      run: async () => {
        const ownerId = await getOwnerUserId();
        const [personalTg, personalDiscord] = ownerId
          ? await Promise.all([
              getUserTelegramChatId(ownerId).catch(() => null),
              getUserDiscordWebhook(ownerId).catch(() => null)
            ])
          : [null, null];
        const personalSink = Boolean((personalTg && env.telegramBotToken) || personalDiscord);
        const globalSink = Boolean(env.telegramBotToken && env.telegramChatId);
        if (!personalSink && !globalSink) return { sent: false };
        const msg = await buildDailyDigest();
        if (!msg) return { sent: false };
        // 優先個人通道；沒有個人通道才送全域 ops（兩者皆有時不重複發給同一人）
        if (personalSink) await sendUserAlert(ownerId, msg);
        else await sendAlert(msg);
        return { sent: true, via: personalSink ? "personal" : "global" };
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

  await setHeartbeat().catch((e) => log.warn("setHeartbeat 失敗", { err: e }));
  if (alerts.length) await sendAlert(`自動排程：${alerts.join("；")}`);
  return NextResponse.json({ ok: true, ...out });
}
