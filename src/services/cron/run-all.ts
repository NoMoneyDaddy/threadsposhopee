import { sendAlert, sendUserAlert } from "@/lib/notify";
import { runPublishQueue } from "@/services/publish/queue";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { reconcileNeedsVerification } from "@/services/threads/reconcile";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { runEvergreen } from "@/services/materials/evergreen";
import { buildDailyDigest } from "@/services/digest/daily";
import { buildPeriodicDigest } from "@/services/digest/periodic";
import { broadcastWeeklyDigests } from "@/services/digest/weekly-broadcast";
import type { NotifyType } from "@/lib/notify-prefs";
import { verifySponsorPosts, ensureSponsorPosts } from "@/services/sponsor/run";
import { runAiAgents } from "@/services/ai/agent-run";
import { cleanupExpiredBindTokens } from "@/lib/telegram-bind";
import { getOwnerUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { setHeartbeat, getUserTelegramChatId } from "@/lib/store";
import { isPushConfigured } from "@/lib/push";
import { listPushSubscriptions } from "@/lib/push-store";
import { log } from "@/lib/logger";

// 總排程主體：被 /api/cron/all（外部 cron）與內建排程（instrumentation tick）共用。
// 每輪：爬取 + 發文佇列 + 贊助補發/驗證；每天 03:xx 展期 token、每週一 04:xx 健檢、每天 09:00 摘要。
export async function runCronAll(now: Date = new Date()): Promise<Record<string, unknown>> {
  const h = now.getUTCHours();
  const min = now.getUTCMinutes();
  const dow = now.getUTCDay(); // 0=日, 1=一
  const out: Record<string, unknown> = { ranAt: now.toISOString() };
  const alerts: string[] = [];

  // 用逐步 try/catch，單一步驟失敗不影響其他步驟
  // 註：自動抓文已改為「純手動」——爬蟲只在使用者於來源頁按「立即抓取」時觸發（/api/pipeline/run），
  // 故總排程不再自動跑 runAllSources，避免在背景持續產生素材與外部成本。
  const steps: { key: string; run: () => Promise<unknown>; warn?: (r: any) => string | null }[] = [
    {
      key: "publish",
      run: runPublishQueue,
      warn: (r) => {
        const parts: string[] = [];
        if (r?.failed?.length) parts.push(`發文 ${r.failed.length} 則失敗`);
        if (r?.replies?.failed) parts.push(`補留言 ${r.replies.failed} 則失敗`);
        return parts.length ? `⚠️ ${parts.join("；")}` : null;
      }
    },
    {
      key: "sponsorFill",
      run: async () => ensureSponsorPosts(await getOwnerUserId()),
      warn: (r) => (r?.created ? `★ 自動補發贊助文 ${r.created} 篇` : null)
    },
    {
      key: "verifySponsor",
      run: verifySponsorPosts,
      warn: (r) => (r?.violations ? `🔒 贊助文 ${r.violations} 則連結被竄改/刪除，已暫停對應帳號` : null)
    },
    {
      key: "aiAgents",
      run: runAiAgents, // 內部以 last_run_at 守門，每個小編每日約一次；產出預設進草稿待審
      warn: (r) => (r?.created ? `🤖 AI 小編新增 ${r.created} 篇貼文（待審或已排程）` : null)
    },
    {
      key: "reconcile",
      run: reconcileNeedsVerification, // 發後讀回比對：確定已發出的「待確認」自動標 published（不自動重發）
      warn: (r) => (r?.resolved ? `✅ 自動確認 ${r.resolved} 則已發布（原待確認）` : null)
    }
  ];
  // 每天展期一次（03:00–03:14 視窗，避免每 15 分重複）
  if (h === 3 && min < 15) {
    steps.push({ key: "refreshTokens", run: refreshExpiringTokens, warn: (r) => (r?.failed ? `⚠️ Token 展期 ${r.failed} 個失敗` : null) });
    // 順手清掉過期未消費的 Telegram 綁定碼（10 分鐘 TTL，殘留量極小，每日清即可）。
    steps.push({ key: "cleanupBindTokens", run: cleanupExpiredBindTokens });
  }
  // 每週一健檢一次（04:00–04:14）
  if (dow === 1 && h === 4 && min < 15) {
    steps.push({
      key: "checkLinks",
      run: async () => checkAffiliateLinks(await getOwnerUserId()),
      warn: (r) => (r?.revived || r?.dead ? `🔗 連結重產 ${r.revived ?? 0}、仍失效 ${r.dead ?? 0}` : null)
    });
  }
  // 常青內容回收：每天一次（台北 13:00 = UTC 05:00–05:14），把到期的常青素材重排成待審草稿。
  if (h === 5 && min < 15) {
    steps.push({
      key: "evergreen",
      run: runEvergreen,
      warn: (r) => (r?.created ? `♻️ 常青回收新增 ${r.created} 篇草稿（待審）` : null)
    });
  }

  // 摘要共用：取 owner 通道，優先個人（依通知偏好開關）、否則全域 ops；無通道則略過。
  const runDigest = async (type: NotifyType, build: () => Promise<string | null>) => {
    const ownerId = await getOwnerUserId();
    const personalTg = ownerId ? await getUserTelegramChatId(ownerId).catch(() => null) : null;
    // 只開瀏覽器推播（未綁 Telegram）的使用者也應收到摘要 → 納入推播訂閱狀態。
    const hasPush = ownerId && isPushConfigured() ? (await listPushSubscriptions(ownerId).catch(() => [])).length > 0 : false;
    const personalSink = Boolean((personalTg && env.telegramBotToken) || hasPush);
    const globalSink = Boolean(env.telegramBotToken && env.telegramChatId);
    if (!personalSink && !globalSink) return { sent: false };
    const msg = await build();
    if (!msg) return { sent: false };
    if (personalSink) await sendUserAlert(ownerId, msg, type);
    else await sendAlert(msg);
    return { sent: true, via: personalSink ? "personal" : "global" };
  };

  // 每日成效摘要（台北 09:00 = UTC 01:00–01:14）。
  if (h === 1 && min < 15) {
    steps.push({ key: "dailyDigest", run: () => runDigest("daily_digest", buildDailyDigest) });
  }
  // 每週收益週報：廣播給所有有綁通知通道的會員，各收自己的數據（每週一台北 10:00 = UTC 02:00–02:14）。
  if (dow === 1 && h === 2 && min < 15) {
    steps.push({
      key: "weeklyDigest",
      run: broadcastWeeklyDigests,
      warn: (r) => (r?.sent ? `📈 已發送 ${r.sent} 份會員週報` : null)
    });
  }
  // 每月績效摘要（每月 1 日台北 10:30 = UTC 02:30–02:44）。
  if (now.getUTCDate() === 1 && h === 2 && min >= 30 && min < 45) {
    steps.push({ key: "monthlyDigest", run: () => runDigest("monthly_digest", () => buildPeriodicDigest("本月", 30)) });
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
  return out;
}
