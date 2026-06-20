import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { createCronHandler } from "@/lib/cron-handler";
import { getOwnerUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 連結健檢（每週一次）：抽查最久沒檢查的分潤連結，失效者先自動重產，重產不成才標失效。
export const GET = createCronHandler(
  "連結健檢",
  async () => checkAffiliateLinks(await getOwnerUserId()),
  (r) =>
    r.revived > 0 || r.dead > 0
      ? `🔗 連結健檢：${r.revived} 個已自動重產` + (r.dead > 0 ? `，${r.dead} 個仍失效（請到素材庫處理）` : "")
      : null
);
