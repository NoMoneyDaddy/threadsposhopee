import { NextResponse } from "next/server";
import { listMaterials, createDraftFromMaterial, userOwnsThreadsAccount } from "@/lib/store";
import { withNextSlot, nextOpenSlotAtHours } from "@/services/publish/slots";
import { getBestHours } from "@/services/threads/engagement";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BULK = 50; // 單次上限，避免一次塞爆佇列

// 常青回收：把多筆有效素材一次排入佇列（各自配下一個空時段），不重燒 token。
// 防封節奏交給時段（slots）＋商品冷卻＋暖機；發布前一律待人工核准的例外是這些已 approved 草稿。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.threads_account_id) {
    return NextResponse.json({ ok: false, error: "缺少 threads_account_id" }, { status: 400 });
  }
  // 多租戶：驗證帳號歸屬
  if (!(await userOwnsThreadsAccount(body.threads_account_id, user.id))) {
    return NextResponse.json({ ok: false, error: "找不到 Threads 帳號" }, { status: 404 });
  }

  // 只回收「有效連結 + 已有文案」的素材
  const materials = (await listMaterials(user.id)).filter(
    (m) => m.affiliate_valid && m.affiliate_short_link && m.main_text
  );
  if (materials.length === 0) {
    return NextResponse.json({ ok: false, error: "沒有可回收的有效素材（需有效連結與文案）" }, { status: 400 });
  }

  // bestTime=true 且有足夠成效資料 → 整批改排在「最佳發文時段」整點；否則用預設 PUBLISH_SLOTS。
  // 成效（getBestHours）只算一次，避免迴圈內逐筆重打 Threads insights API。
  const hours = body.bestTime === true ? await getBestHours(user.id) : [];
  const pick = hours.length ? (taken: Set<string>) => nextOpenSlotAtHours(taken, hours) : undefined;

  let queued = 0;
  let full = false;
  for (const m of materials.slice(0, MAX_BULK)) {
    const draft = await withNextSlot(
      user.id,
      (slot) =>
        createDraftFromMaterial(m, {
          owner_id: user.id,
          threads_account_id: body.threads_account_id,
          status: "approved",
          scheduled_at: slot
        }),
      5,
      pick
    );
    if (!draft) {
      full = true; // 30 天內時段已滿，停止
      break;
    }
    queued += 1;
  }

  return NextResponse.json({ ok: true, queued, full, candidates: materials.length, bestTime: hours.length > 0 });
}
