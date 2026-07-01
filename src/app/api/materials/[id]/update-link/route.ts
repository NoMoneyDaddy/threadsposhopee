import { NextResponse } from "next/server";
import { getMaterial, reviveAffiliateLink, updateMaterialProductLink } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { parseShopeeIds } from "@/services/shopee/expand";
import { refreshAffiliateLink } from "@/services/materials/refresh-link";
import { errMessage } from "@/lib/api-error";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 更新素材連結（連結失效時修正）：
// - product_url：貼新的原始商品連結 → 重新解析 shop/item、更新原始連結、並用你的金鑰重產分潤連結。
// - affiliate_link：手動覆寫分潤連結（直接貼可用的分潤短連結，不重產）。
// 兩者擇一或並用；皆會把該素材標回「連結有效」。多租戶：以 owner_id 過濾。
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = params.id;
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "素材 id 格式不正確" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) || {};
  const productUrl = typeof body.product_url === "string" ? body.product_url.trim() : "";
  const affiliateLink = typeof body.affiliate_link === "string" ? body.affiliate_link.trim() : "";
  if (!productUrl && !affiliateLink) {
    return NextResponse.json({ ok: false, error: "請提供新的商品連結或分潤連結" }, { status: 400 });
  }
  const isHttp = (u: string) => /^https?:\/\//i.test(u);
  if (productUrl && !isHttp(productUrl)) return NextResponse.json({ ok: false, error: "商品連結格式不正確" }, { status: 400 });
  if (affiliateLink && !isHttp(affiliateLink)) return NextResponse.json({ ok: false, error: "分潤連結格式不正確" }, { status: 400 });

  try {
    const m = await getMaterial(id, user.id);
    if (!m) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });

    let cleanUrl = m.clean_product_url;
    let itemId = m.item_id;

    // 1) 先更新原始商品連結（若提供）。
    if (productUrl) {
      const ids = parseShopeeIds(productUrl);
      if (!ids) return NextResponse.json({ ok: false, error: "無法從連結解析出蝦皮商品（請貼完整商品頁連結）" }, { status: 400 });
      const r = await updateMaterialProductLink(id, user.id, productUrl, ids.shopId, ids.itemId);
      if (r === "notfound") return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
      if (r === "conflict") return NextResponse.json({ ok: false, error: "你已有相同商品的另一筆素材，無法更新為該商品" }, { status: 409 });
      cleanUrl = productUrl;
      itemId = ids.itemId;
    }

    // 2) 分潤連結：手動覆寫優先；否則若更新了商品連結就用新連結重產。
    if (affiliateLink) {
      await reviveAffiliateLink(id, user.id, affiliateLink, m.affiliate_sub_id ?? null);
      return NextResponse.json({ ok: true, link: affiliateLink, regenerated: false });
    }
    const { link, subId } = await refreshAffiliateLink(user.id, { cleanUrl, itemId, accountTag: null });
    await reviveAffiliateLink(id, user.id, link, subId);
    return NextResponse.json({ ok: true, link, regenerated: true });
  } catch (e) {
    log.error("更新素材連結失敗", { materialId: id, ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: errMessage(e) }, { status: 400 });
  }
}
