import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 連結健檢（每週一次）：抽查最久沒檢查的分潤連結，明顯失效者標記。
export const GET = createCronHandler(
  "連結健檢",
  () => checkAffiliateLinks(),
  (r) => (r.dead > 0 ? `⚠️ 連結健檢：發現 ${r.dead} 個失效分潤連結，請到素材庫重新產生。` : null)
);
