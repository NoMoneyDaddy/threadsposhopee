import { NextResponse } from "next/server";
import { getMaterial, reviveAffiliateLink } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { refreshAffiliateLink } from "@/services/materials/refresh-link";
import { errMessage } from "@/lib/api-error";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 刷新單筆素材的分潤連結：用「當前」Shopee 金鑰＋當前 Sub id 設定重產，寫回短連結＋subId 並標 valid。
// 用途：改了 Sub id 設定、或連結失效／商品重上架時，不必重抓整筆即可就地更新。
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });
  try {
    const m = await getMaterial(id, user.id);
    if (!m) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    const { link, subId } = await refreshAffiliateLink(user.id, {
      cleanUrl: m.clean_product_url,
      itemId: m.item_id,
      accountTag: null
    });
    await reviveAffiliateLink(id, user.id, link, subId);
    return NextResponse.json({ ok: true, link, subId });
  } catch (e) {
    log.error("刷新素材分潤連結失敗", { materialId: id, ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: errMessage(e) }, { status: 400 });
  }
}
