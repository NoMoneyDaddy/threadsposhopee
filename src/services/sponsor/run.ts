// 贊助文章驗證（功能 B 階段 3）：抓回已發的贊助文，確認平台分潤連結仍在；
// 被刪除或竄改 → 暫停該 Threads 帳號發文（恢復走帳號管理的手動啟用）。由 /api/cron/all 觸發。
import {
  listSponsorRecordsToVerify,
  setSponsorRecord,
  getSponsorRecord,
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
  listDrafts
} from "@/lib/store";
import { getPostText } from "@/services/threads/verify";
import { resolveSponsorResources, buildSponsorLinkForAccount } from "@/services/sponsor/link";
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
  const res = cfg.productUrl ? await resolveSponsorResources(cfg.productUrl, ownerUserId).catch(() => null) : null;
  if (!res && !cfg.affiliateLink) return out; // 無連結
  const accounts = (await listActiveThreadsAccountsAll().catch(() => [])).filter((a) => a.owner_id !== ownerUserId);
  const start = Date.now();
  let idx = 0;
  for (const acc of accounts) {
    if (Date.now() - start > 40000) break; // 守 maxDuration
    try {
      if (await getSponsorRecord(acc.id, tp.date)) continue; // 今天已有贊助文（佇列已換）
      const pick = await getSponsorPick(acc.id);
      if (pick?.draftId) continue; // 使用者自選 → 交由佇列處理，不重複補發
      const link = (res ? await buildSponsorLinkForAccount(res, acc.id).catch(() => null) : null) || cfg.affiliateLink || null;
      if (!link) continue;
      const tmpl = ownerDrafts[idx % ownerDrafts.length];
      idx++;
      const text = swapAffiliateLink(tmpl.main_text, tmpl.shopee_short_link, link);
      const creds = await getThreadsCredentials(acc.id, acc.owner_id);
      if (!creds) continue;
      const r = await publishToThreads({
        threadsUserId: creds.threadsUserId,
        accessToken: creds.accessToken,
        text,
        media: normalizeDraftMedia(tmpl),
        replyText: null,
        deferReply: false
      });
      await setSponsorRecord(acc.id, tp.date, { postId: r.postId, link, ownerId: acc.owner_id, at: new Date().toISOString() });
      out.created++;
    } catch (e) {
      log.warn("自動補發贊助文失敗", { accId: acc.id, err: e });
    }
  }
  return out;
}

export async function verifySponsorPosts(): Promise<{ checked: number; violations: number }> {
  const out = { checked: 0, violations: 0 };
  if (isDemoMode) return out;
  const entries = await listSponsorRecordsToVerify(VERIFY_AFTER_MS).catch(() => []);
  for (const { accountId, date, rec } of entries) {
    out.checked++;
    try {
      const creds = await getThreadsCredentials(accountId, rec.ownerId);
      if (!creds) continue; // 帳號已不存在 → 略過（不誤判暫停）
      const text = await getPostText(rec.postId, creds.accessToken);
      // text===null 代表貼文被刪/讀不到；否則檢查平台分潤連結是否仍在內文。
      const ok = text !== null && (rec.link ? text.includes(rec.link) : true);
      if (ok) {
        await setSponsorRecord(accountId, date, { ...rec, verified: true });
      } else {
        out.violations++;
        await setThreadsAccountStatus(accountId, rec.ownerId, "paused").catch((e) =>
          log.warn("暫停帳號失敗", { accountId, err: e })
        );
        await setSponsorRecord(accountId, date, { ...rec, verified: true, violated: true });
        await sendUserAlert(
          rec.ownerId,
          "⚠️ 你的贊助文章連結被移除或竄改，該帳號發文已暫停。請至帳號管理重新啟用（並遵守贊助文章規則）。"
        ).catch(() => {});
      }
    } catch (e) {
      log.warn("驗證贊助文發生錯誤", { accountId, err: e });
    }
  }
  return out;
}
