// 贊助文驗證（功能 B 階段 3）：抓回已發的贊助文，確認平台分潤連結仍在；
// 被刪除或竄改 → 暫停該 Threads 帳號發文（恢復走帳號管理的手動啟用）。由 /api/cron/all 觸發。
import {
  listSponsorRecordsToVerify,
  appendSponsorRecord,
  updateSponsorRecordAt,
  countSponsorToday,
  getSponsorPick,
  getSponsorConfig,
  taipeiParts,
  inOffPeak,
  swapAffiliateLink
} from "@/lib/sponsor";
import {
  getThreadsCredentials,
  setThreadsAccountStatus,
  listActiveThreadsAccountsAll,
  listDrafts,
  getContributionScore,
  getSponsorRewardMode,
  getCachedJson,
  setCachedJson
} from "@/lib/store";
import { isSponsorExempt, canOwnLink } from "@/lib/contribution";
import { getPostText } from "@/services/threads/verify";
import { resolveSponsorOwnerCreds, buildSponsorLinkForAccount, cleanProductUrlFromDraft } from "@/services/sponsor/link";
import { publishToThreads } from "@/services/threads/publish";
import { normalizeDraftMedia } from "@/lib/media";
import { sendUserAlert } from "@/lib/notify";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

const VERIFY_AFTER_MS = 2 * 3600_000; // 發出 2 小時後才驗（給使用者正常使用的緩衝）

// 冷門時段自動補發（功能 B 階段 3b）：非 owner 帳號今天還沒贊助文（佇列沒換到、也沒自選）時，
// 用 owner 草稿內容＋每帳號平台分潤連結自動補一篇，保證每帳號每日一篇。
export async function ensureSponsorPosts(ownerUserId: string | null): Promise<{ created: number }> {
  const out = { created: 0 };
  if (isDemoMode || !ownerUserId) return out;
  const cfg = await getSponsorConfig();
  if (!cfg.enabled) return out;
  const tp = taipeiParts();
  if (!inOffPeak(tp.hour, cfg.offPeakStart, cfg.offPeakEnd)) return out; // 只在冷門時段補
  const ownerDrafts = (await listDrafts(ownerUserId).catch(() => [])).filter((d) => (d.main_text ?? "").trim());
  if (ownerDrafts.length === 0) return out; // 無內容可發
  // owner 金鑰整輪取一次；商品連結改用「owner 草稿自己的」就地改寫成 owner 分潤連結。
  const ownerCreds = await resolveSponsorOwnerCreds(ownerUserId).catch(() => null);
  const ownCredsByOwner = new Map<string, Awaited<ReturnType<typeof resolveSponsorOwnerCreds>> | null>();
  const accounts = (await listActiveThreadsAccountsAll().catch(() => [])).filter((a) => a.owner_id !== ownerUserId);
  const start = Date.now();
  let idx = 0;
  // 高貢獻者回饋：exempt＝免每日贊助文（門檻較低）；own_link＝照發但換成自己的分潤連結自賺（門檻更高）。按 owner 快取。
  const rewardByOwner = new Map<string, { high: boolean; ownLink: boolean }>();
  for (const acc of accounts) {
    if (Date.now() - start > 40000) break; // 守 maxDuration
    const oid = acc.owner_id;
    if (!oid) continue;
    try {
      let reward = rewardByOwner.get(oid);
      if (reward === undefined) {
        const score = await getContributionScore(oid).catch(() => 0);
        const high = isSponsorExempt(score);
        const mode = high ? await getSponsorRewardMode(oid).catch(() => "exempt" as const) : "exempt";
        // 自賺需達更高門檻：選了 own_link 但分數不夠 → 退回 exempt（仍免發，但不自賺）。
        reward = { high, ownLink: mode === "own_link" && canOwnLink(score) };
        rewardByOwner.set(oid, reward);
      }
      if (reward.high && !reward.ownLink) continue; // 免贊助（含選 own_link 但未達自賺門檻者）
      // 安全網只保底「至少 1 篇」；配額>1 的額外贊助由發文佇列在當日達成（此處不追量）。
      if ((await countSponsorToday(acc.id, tp.date)) >= 1) continue;
      const pick = await getSponsorPick(acc.id);
      if (pick?.draftId) continue; // 使用者自選 → 交由佇列處理，不重複補發

      // 取一篇 owner 草稿當內容＋商品來源（就地改寫成分潤連結）。
      const tmpl = ownerDrafts[idx % ownerDrafts.length];
      idx++;
      const cleanUrl = await cleanProductUrlFromDraft(tmpl).catch(() => null);
      if (!cleanUrl) continue; // 該草稿無商品連結可改寫
      // own_link：高貢獻者照發，但用「他自己」的金鑰重產（自賺）；否則用 owner 金鑰（平台分潤）。
      const useOwnLink = reward.ownLink;
      let link: string | null = null;
      if (useOwnLink) {
        if (!ownCredsByOwner.has(oid)) ownCredsByOwner.set(oid, await resolveSponsorOwnerCreds(oid).catch(() => null));
        const cc = ownCredsByOwner.get(oid) ?? null;
        link = cc ? await buildSponsorLinkForAccount({ cleanUrl, ...cc }, acc.id).catch(() => null) : null;
        if (!link) continue; // 沒綁金鑰／重產失敗 → 不退回平台連結（避免幫他發了卻沒回饋）
      } else {
        link = ownerCreds ? await buildSponsorLinkForAccount({ cleanUrl, ...ownerCreds }, acc.id).catch(() => null) : null;
      }
      if (!link) continue;
      const text = swapAffiliateLink(tmpl.main_text, tmpl.shopee_short_link, link);
      const creds = await getThreadsCredentials(acc.id, oid);
      if (!creds) continue;
      const r = await publishToThreads({
        threadsUserId: creds.threadsUserId,
        accessToken: creds.accessToken,
        text,
        media: normalizeDraftMedia(tmpl),
        replyText: null,
        deferReply: false
      });
      await appendSponsorRecord(acc.id, tp.date, { postId: r.postId, link, ownerId: oid, at: new Date().toISOString(), ownLink: useOwnLink || undefined });
      out.created++;
    } catch (e) {
      log.warn("自動補發贊助文失敗", { accId: acc.id, err: e });
    }
  }
  return out;
}

// 違規寬鬆化：單次刪文/竄改不立即暫停，累計達門檻才暫停（容許偶發/誤刪）。
// 連續驗證通過會清零。strike 以 30 天滾動窗存於 app_state。
const SPONSOR_VIOLATION_LIMIT = 3;
const STRIKE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function verifySponsorPosts(): Promise<{ checked: number; violations: number }> {
  const out = { checked: 0, violations: 0 };
  if (isDemoMode) return out;
  const entries = await listSponsorRecordsToVerify(VERIFY_AFTER_MS).catch(() => []);
  for (const { accountId, date, index, rec } of entries) {
    out.checked++;
    try {
      if (rec.ownLink) continue; // 高貢獻者用自己連結的贊助文：非平台分潤，不做連結驗證/裁罰
      const creds = await getThreadsCredentials(accountId, rec.ownerId);
      if (!creds) continue; // 帳號已不存在 → 略過（不誤判暫停）
      const text = await getPostText(rec.postId, creds.accessToken);
      // text===null 代表貼文被刪/讀不到；否則檢查平台分潤連結是否仍在內文。
      const ok = text !== null && (rec.link ? text.includes(rec.link) : true);
      const strikeKey = `sponsor_strikes:${accountId}`;
      if (ok) {
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true });
        // 通過則清零累計違規（寬鬆：給機會重新累積）
        await setCachedJson(strikeKey, 0).catch(() => {});
      } else {
        out.violations++;
        await updateSponsorRecordAt(accountId, date, index, { ...rec, verified: true, violated: true });
        const prev = (await getCachedJson<number>(strikeKey, STRIKE_WINDOW_MS).catch(() => 0)) ?? 0;
        const strikes = prev + 1;
        await setCachedJson(strikeKey, strikes).catch(() => {});
        if (strikes >= SPONSOR_VIOLATION_LIMIT) {
          // 累計達上限才暫停（恢復走帳號管理手動啟用）
          await setThreadsAccountStatus(accountId, rec.ownerId, "paused").catch((e) =>
            log.warn("暫停帳號失敗", { accountId, err: e })
          );
          await sendUserAlert(
            rec.ownerId,
            `⚠️ 你的贊助文連結多次（${strikes} 次）被移除或竄改，該帳號發文已暫停。請至帳號管理重新啟用並遵守贊助文規則。`,
            "sponsor_violation"
          ).catch(() => {});
        } else {
          // 未達上限：只提醒、不暫停
          await sendUserAlert(
            rec.ownerId,
            `🔔 提醒：你的贊助文連結被移除或竄改（第 ${strikes}/${SPONSOR_VIOLATION_LIMIT} 次）。累計達上限才會暫停發文，請遵守贊助文規則。`,
            "sponsor_violation"
          ).catch(() => {});
        }
      }
    } catch (e) {
      log.warn("驗證贊助文發生錯誤", { accountId, err: e });
    }
  }
  return out;
}
