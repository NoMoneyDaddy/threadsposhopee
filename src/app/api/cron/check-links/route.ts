import { NextResponse } from "next/server";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { assertCron } from "@/lib/cron-auth";
import { sendAlert } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 連結健檢（每週一次）：抽查最久沒檢查的分潤連結，明顯失效者標記，前端顯示「連結失效」。
export async function GET(req: Request) {
  const denied = assertCron(req);
  if (denied) return denied;
  try {
    const result = await checkAffiliateLinks();
    if (result.dead > 0) {
      await sendAlert(`⚠️ 連結健檢：發現 ${result.dead} 個失效分潤連結，請到素材庫重新產生。`);
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sendAlert(`❌ 連結健檢 cron 失敗：${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
