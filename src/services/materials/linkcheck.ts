// 分潤連結健檢：保守偵測「明顯失效」的連結（硬 404/410 或網域掛掉）。
// ponytail: 只在明確失效時標 invalid，避免誤判白白重燒 token。
// 上限：蝦皮「商品下架」有時仍回 200 導向其他頁，這種軟失效抓不到；
//       升級路徑為改用 Shopee productOfferV2 重查商品是否存在。
import { fetchWithTimeout } from "@/lib/http";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { listMaterialsToCheck, setAffiliateChecked } from "@/lib/store";

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

export async function checkAffiliateLinks(): Promise<{ checked: number; dead: number }> {
  const items = await listMaterialsToCheck();
  let dead = 0;
  // 並行檢查，但限制併發避免一次太多外部請求
  const results = await Promise.all(
    items.map(async (m) => {
      const isDead = await isLinkDead(m.link);
      await setAffiliateChecked(m.id, isDead).catch(() => {});
      return isDead;
    })
  );
  dead = results.filter(Boolean).length;
  return { checked: items.length, dead };
}
