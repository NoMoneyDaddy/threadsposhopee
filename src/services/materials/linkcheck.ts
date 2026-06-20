// 分潤連結健檢：保守偵測「明顯失效」的連結（硬 404/410 或網域掛掉）。
// ponytail: 只在明確失效時標 invalid，避免誤判白白重燒 token。
// 上限：蝦皮「商品下架」有時仍回 200 導向其他頁，這種軟失效抓不到；
//       升級路徑為改用 Shopee productOfferV2 重查商品是否存在。
import { fetchWithTimeout } from "@/lib/http";
import { log } from "@/lib/logger";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { listMaterialsToCheck, setAffiliateChecked, reviveAffiliateLink, type MaterialToCheck } from "@/lib/store";
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
async function checkOne(m: MaterialToCheck, ownerUserId: string | null): Promise<Outcome> {
  const logFail = (what: string) => (e: unknown) =>
    log.warn("連結健檢失敗", { what, materialId: m.id, err: e });
  if (!(await isLinkDead(m.link))) {
    await setAffiliateChecked(m.id, false).catch(logFail("標記已檢查"));
    return "ok";
  }
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
  // 分批檢查，每批最多 5 個並行，避免一次開過多外部連線
  const CONCURRENCY = 5;
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((m) => checkOne(m, ownerUserId)));
    dead += results.filter((r) => r === "dead").length;
    revived += results.filter((r) => r === "revived").length;
  }
  return { checked: items.length, dead, revived };
}
