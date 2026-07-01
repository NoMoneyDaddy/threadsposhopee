import { sendAlert, sendUserAlert } from "@/lib/notify";
import { runPublishQueue } from "@/services/publish/queue";
import { refreshExpiringTokens } from "@/services/threads/refresh";
import { refreshThreadsProfiles } from "@/services/threads/profile-refresh";
import { reconcileNeedsVerification } from "@/services/threads/reconcile";
import { reconcileFailedReplies } from "@/services/threads/reply-reconcile";
import { refreshPostMetrics } from "@/services/threads/post-metrics";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { runEvergreen } from "@/services/materials/evergreen";
import { buildDailyDigest } from "@/services/digest/daily";
import { buildPeriodicDigest } from "@/services/digest/periodic";
import { broadcastWeeklyDigests } from "@/services/digest/weekly-broadcast";
import type { NotifyType } from "@/lib/notify-prefs";
import { verifySponsorPosts } from "@/services/sponsor/run";
import { cleanupOldSponsorRecords } from "@/lib/sponsor";
import { runAiAgents } from "@/services/ai/agent-run";
import { pollActiveScrapeRuns } from "@/services/scraper/async-scrape";
import { cleanupExpiredBindTokens } from "@/lib/telegram-bind";
import { getOwnerUserId } from "@/lib/auth";
import { env } from "@/lib/env";
import { setHeartbeat, getUserTelegramChatId, claimCronOnce } from "@/lib/store";
import { isPushConfigured } from "@/lib/push";
import { listPushSubscriptions } from "@/lib/push-store";
import { log } from "@/lib/logger";

// 總排程主體：被 /api/cron/all（外部 cron）與內建排程（instrumentation tick）共用。
// 每輪：爬取 + 發文佇列 + 贊助補發/驗證；每天 03:xx 展期 token、每週一 04:xx 健檢、每天 09:00 摘要。
export async function runCronAll(now: Date = new Date()): Promise<Record<string, unknown>> {
  const h = now.getUTCHours();
  const dow = now.getUTCDay(); // 0=日, 1=一
  const out: Record<string, unknown> = { ranAt: now.toISOString() };
  const alerts: string[] = [];

  // 「每日/週/月只跑一次」守門：不再依賴「cron 約每 15 分」的 min<15 窗口，改用原子 claim，
  // 讓本排程在任何頻率（甚至每分鐘）都安全——同一 UTC 日內第一次進到該時段的輪次才執行，其餘略過。
  // stamp 用 UTC 日期（YYYY-MM-DD，單調遞增）；各任務在各自時段（h/dow/date）內僅 claim 成功一次。
  const dayStamp = now.toISOString().slice(0, 10);
  const onceDaily = (key: string, fn: () => Promise<unknown>) => async () => {
    if (!(await claimCronOnce(key, dayStamp))) return { skipped: "本週期已執行" };
    return fn();
  };

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
    },
    {
      key: "reconcileReplies",
      run: reconcileFailedReplies, // 補留言假失敗讀回修正：實際已發卻被標 failed → 自動改 published/續發（不重貼）
      warn: (r) => (r?.resolved || r?.advanced ? `✅ 留言補發自動修正 ${(r.resolved ?? 0) + (r.advanced ?? 0)} 則（讀回確認已發）` : null)
    },
    {
      // 非同步抓取：推進使用者啟動的 Apify run（完成就抓 dataset 入庫）。關頁也會由此跑完。
      key: "scrapeRuns",
      run: () => pollActiveScrapeRuns()
    },
    {
      // 發文成效回填：分批抓已發布貼文的 views/likes（30 天內、24h 沒更新者），供共享排序加權。
      key: "postMetrics",
      run: refreshPostMetrics
    }
  ];
  // 每天展期一次（UTC 03 時；onceDaily 保證該日只跑一次，與 cron 頻率無關）
  if (h === 3) {
    steps.push({ key: "refreshTokens", run: onceDaily("refreshTokens", refreshExpiringTokens), warn: (r) => (r?.failed ? `⚠️ Token 展期 ${r.failed} 個失敗` : null) });
    // 每日刷新各帳號頭像／顯示名稱：Threads 頭像 URL 是會過期的簽名連結，重抓寫回避免失效（草稿預覽/帳號頁變灰圈）。
    steps.push({ key: "refreshProfiles", run: onceDaily("refreshProfiles", refreshThreadsProfiles), warn: (r) => (r?.failed ? `⚠️ 頭像刷新 ${r.failed} 個失敗` : null) });
    // 順手清掉過期未消費的 Telegram 綁定碼（10 分鐘 TTL，殘留量極小，每日清即可）。
    steps.push({ key: "cleanupBindTokens", run: onceDaily("cleanupBindTokens", cleanupExpiredBindTokens) });
    // 清理 90 天前的贊助紀錄，避免 app_state 無限增長拖慢鎖/心跳與驗證掃描。
    steps.push({ key: "cleanupSponsorRecords", run: onceDaily("cleanupSponsorRecords", () => cleanupOldSponsorRecords(90)), warn: (r) => (r?.deleted ? `🧹 清理贊助紀錄 ${r.deleted} 列` : null) });
  }
  // 每週一健檢一次（UTC 04 時）
  if (dow === 1 && h === 4) {
    steps.push({
      key: "checkLinks",
      run: onceDaily("checkLinks", async () => checkAffiliateLinks(await getOwnerUserId())),
      warn: (r) => (r?.revived || r?.dead ? `🔗 連結重產 ${r.revived ?? 0}、仍失效 ${r.dead ?? 0}` : null)
    });
  }
  // 常青內容回收：每天一次（台北 13:00 = UTC 05 時），把到期的常青素材重排成待審草稿。
  if (h === 5) {
    steps.push({
      key: "evergreen",
      run: onceDaily("evergreen", runEvergreen),
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

  // 每日成效摘要（台北 09:00 = UTC 01 時；onceDaily 保證一天一封，不論 cron 頻率）。
  if (h === 1) {
    steps.push({ key: "dailyDigest", run: onceDaily("dailyDigest", () => runDigest("daily_digest", buildDailyDigest)) });
  }
  // 每週收益週報：廣播給所有有綁通知通道的會員，各收自己的數據（每週一台北 10:00 = UTC 02 時）。
  if (dow === 1 && h === 2) {
    steps.push({
      key: "weeklyDigest",
      run: onceDaily("weeklyDigest", broadcastWeeklyDigests),
      warn: (r) => (r?.sent ? `📈 已發送 ${r.sent} 份會員週報` : null)
    });
  }
  // 每月績效摘要（每月 1 日台北 10:00 = UTC 02 時；與週報同時段但各自 onceDaily 守門，互不重複）。
  if (now.getUTCDate() === 1 && h === 2) {
    steps.push({ key: "monthlyDigest", run: onceDaily("monthlyDigest", () => runDigest("monthly_digest", () => buildPeriodicDigest("本月", 30))) });
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
