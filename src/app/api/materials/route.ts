import { NextResponse } from "next/server";
import { resolveMaterialFromUrl } from "@/services/materials/fromUrl";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Shopee 還原 + 分潤 + Cloudinary 中轉 + Gemini 文案的多 API 串接，放寬逾時上限
export const maxDuration = 60;

// 手動建立素材：貼蝦皮商品連結 → 還原商品 → 換分潤連結 →（可選）AI 文案 → 存素材。
// owner 用環境變數的 Shopee 金鑰；member 只能用自己的金鑰（沒設則直接用貼上的連結）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const url: string = (body.shopee_url ?? "").trim();
    if (!url) return NextResponse.json({ ok: false, error: "缺少 shopee_url" }, { status: 400 });

    const { material, reused, notes } = await resolveMaterialFromUrl(url, user, body.generate_copy !== false);
    return NextResponse.json({ ok: true, material, reused, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
