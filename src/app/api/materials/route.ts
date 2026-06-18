import { NextResponse } from "next/server";
import { expandShopeeLink } from "@/services/shopee/expand";
import { buildMaterialForProduct } from "@/services/materials/build";
import { findMaterial, getShopeeCredentials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
// Shopee 還原 + 分潤 + Cloudinary 中轉 + Gemini 文案的多 API 串接，放寬逾時上限
export const maxDuration = 60;

// 手動建立素材：貼蝦皮商品連結 → 還原商品 → 換分潤連結 →（可選）AI 文案 → 存素材。
// owner 用環境變數的 Shopee 金鑰；member 只能用自己的金鑰（沒設則直接用貼上的連結）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const ownerId = user.id;

    const body = await req.json();
    const url: string = (body.shopee_url ?? "").trim();
    if (!url) return NextResponse.json({ ok: false, error: "缺少 shopee_url" }, { status: 400 });

    const expanded = await expandShopeeLink(url);
    if (!expanded) {
      return NextResponse.json({ ok: false, error: "無法從連結解析商品 id（shop_id/item_id）" }, { status: 400 });
    }

    const existing = await findMaterial(expanded.shopId, expanded.itemId, ownerId);
    if (existing && existing.affiliate_valid && existing.affiliate_short_link) {
      return NextResponse.json({ ok: true, material: existing, reused: true });
    }

    // 解析該使用者要用的 Shopee 金鑰
    let shopeeCreds: { appId: string; secret: string; subId: string } | null = null;
    if (user.isOwner && env.shopeeAppId && env.shopeeSecret) {
      shopeeCreds = { appId: env.shopeeAppId, secret: env.shopeeSecret, subId: env.shopeeDefaultSubId };
    } else {
      shopeeCreds = await getShopeeCredentials(ownerId); // member 自己的金鑰（可能為 null）
    }

    const notes: string[] = [];
    const material = await buildMaterialForProduct(
      {
        shopId: expanded.shopId,
        itemId: expanded.itemId,
        cleanUrl: expanded.cleanUrl,
        originalShortLink: url,
        subIdTag: user.isOwner ? "manual" : ownerId.slice(0, 8),
        withCopy: body.generate_copy !== false
      },
      ownerId,
      shopeeCreds,
      notes
    );
    return NextResponse.json({ ok: true, material, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
