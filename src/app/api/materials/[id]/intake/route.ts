import { NextResponse } from "next/server";
import { approveMaterialIntake, getDefaultShareMaterials, getFeatureFlags } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 素材 id 為 UUID；入口先驗格式，避免把無效輸入帶進更新邏輯（並讓格式錯誤回 400 而非 500）。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 核准待審素材入庫（intake_status → approved）。多租戶：store 以 owner_id 過濾，只核准得到自己的。
// 「丟棄」沿用既有 DELETE /api/materials/[id]，不另做。
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });
  try {
    // 入庫是否同時分享：body.share 明確指定則從之；否則用使用者「新素材預設分享」設定（共享庫未開放則不分享）。
    const body = (await req.json().catch(() => ({}))) || {};
    let share: boolean;
    if (typeof body.share === "boolean") share = body.share;
    else share = (await getFeatureFlags()).shared ? await getDefaultShareMaterials(user.id).catch(() => false) : false;
    const ok = await approveMaterialIntake(id, user.id, share);
    if (!ok) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true, shared: share });
  } catch (e) {
    log.error("核准素材入庫失敗", { materialId: id, ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "核准時發生問題，請稍後再試" }, { status: 500 });
  }
}
