// 分潤連結健檢：保守偵測「明顯失效」的連結（硬 404/410 或網域掛掉）。
// ponytail: 只在明確失效時標 invalid，避免誤判白白重燒 token。
// 上限：蝦皮「商品下架」有時仍回 200 導向其他頁，這種軟失效抓不到；
//       升級路徑為改用 Shopee productOfferV2 重查商品是否存在。
import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { listMaterialsToCheck, setAffiliateChecked, reviveAffiliateLink, getAutoReviveLinks, type MaterialToCheck } from "@/lib/store";
import { sendUserAlert } from "@/lib/notify";
import { regenerateAffiliateLink } from "./regen";

// 回傳 true 代表「明確失效」；其餘狀況（200/3xx/403/逾時/網路錯誤）一律視為未知 → 不標失效。
async function isLinkDead(link: string): Promise<boolean> {
  try {
    assertSafePublicUrl(link);
    const res = await fetchWithTimeout(link, { method: "GET", redirect: "follow" }, 8000);
    return res.status === 404 || res.status === 410;
  } catch {
    return false; // 網路錯誤/逾時 → 未知，不冤枉好連結
  }
}

type Outcome = "ok" | "revived" | "dead";

// 失效連結先嘗試重產（短連結過期常見）：重產出新連結且確認非失效 → 復活；否則標失效。
// autoRevive=false（預設）：失效只標記、不重產（使用者未開啟自動替換）。
async function checkOne(m: MaterialToCheck, ownerUserId: string | null, autoRevive: boolean): Promise<Outcome> {
  const logFail = (what: string) => (e: unknown) =>
    log.warn("連結健檢失敗", { what, materialId: m.id, err: e });
  if (!(await isLinkDead(m.link))) {
    await setAffiliateChecked(m.id, false).catch(logFail("標記已檢查"));
    return "ok";
  }
  if (autoRevive) {
    try {
      const regen = await regenerateAffiliateLink(m, ownerUserId);
      if (regen && !(await isLinkDead(regen.link))) {
        await reviveAffiliateLink(m.id, m.owner_id, regen.link, regen.subId);
        return "revived";
      }
    } catch (e) {
      // 重產失敗（金鑰/API 問題）→ 記 log 後落到標失效，由告警提示人工處理
      logFail("自動重產")(e);
    }
  }
  await setAffiliateChecked(m.id, true).catch(logFail("標記失效"));
  return "dead";
}

// ownerUserId：env 金鑰後備的歸屬判定（owner 素材才退環境金鑰）。
// scopeOwnerId：有值時只檢查該 owner 的素材（owner 手動觸發）；null = 全租戶（cron worker）。
export async function checkAffiliateLinks(
  ownerUserId: string | null = null,
  scopeOwnerId: string | null = null
): Promise<{ checked: number; dead: number; revived: number }> {
  const items = await listMaterialsToCheck(30, scopeOwnerId);
  let dead = 0;
  let revived = 0;
  // 自動替換為各使用者偏好（預設關）：依素材 owner 查一次並快取本輪。
  const autoReviveCache = new Map<string, boolean>();
  const autoReviveFor = async (oid: string | null): Promise<boolean> => {
    if (!oid) return false;
    if (!autoReviveCache.has(oid)) autoReviveCache.set(oid, await getAutoReviveLinks(oid).catch(() => false));
    return autoReviveCache.get(oid)!;
  };
  // 失效（dead）依 owner 彙整，整輪結束推一則通知（避免逐則洗版）。
  const deadByOwner: Record<string, number> = {};
  // 分批檢查，每批最多 5 個並行，避免一次開過多外部連線
  const CONCURRENCY = 5;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (m) => ({ outcome: await checkOne(m, ownerUserId, await autoReviveFor(m.owner_id)), ownerId: m.owner_id }))
    );
    for (const r of results) {
      if (r.outcome === "dead") {
        dead++;
        if (r.ownerId) deadByOwner[r.ownerId] = (deadByOwner[r.ownerId] ?? 0) + 1;
      } else if (r.outcome === "revived") {
        revived++;
      }
    }
  }
  // 個人通知：你的分潤連結失效（需到素材頁重產或開啟自動替換）。
  for (const [oid, n] of Object.entries(deadByOwner)) {
    await sendUserAlert(oid, `🔗 你有 ${n} 個分潤連結失效，到素材頁可重產（或在帳號管理開啟「失效自動替換」）。`, "link_dead").catch(() => {});
  }
  return { checked: items.length, dead, revived };
}
