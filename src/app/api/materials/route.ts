import { NextResponse } from "next/server";
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial } from "@/lib/store";

export const dynamic = "force-dynamic";

// 手動建立素材：貼一個蝦皮商品連結（短連結或完整網址）→ 還原商品 →
// 換成自己 subId 的分潤連結 → （可選）AI 文案 → 存素材。
// body: { shopee_url, generate_copy?, tag? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const url: string = (body.shopee_url ?? "").trim();
    if (!url) {
      return NextResponse.json({ ok: false, error: "缺少 shopee_url" }, { status: 400 });
    }

    const expanded = await expandShopeeLink(url);
    if (!expanded) {
      return NextResponse.json({ ok: false, error: "無法從連結解析商品 id（shop_id/item_id）" }, { status: 400 });
    }

    // 已存在且有效就直接回傳，不重燒 token
    const existing = await findMaterial(expanded.shopId, expanded.itemId);
    if (existing && existing.affiliate_valid && existing.affiliate_short_link) {
      return NextResponse.json({ ok: true, material: existing, reused: true });
    }

    const notes: string[] = [];
    const material = await buildMaterialForProduct(
      {
        shopId: expanded.shopId,
        itemId: expanded.itemId,
        cleanUrl: expanded.cleanUrl,
        originalShortLink: url,
        subIdTag: body.tag || "manual",
        withCopy: body.generate_copy !== false
      },
      notes
    );
    return NextResponse.json({ ok: true, material, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
