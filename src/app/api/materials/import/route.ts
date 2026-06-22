import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getSharedMaterial, incrementImportCount, setMaterialCopyIfEmpty } from "@/lib/store";
import { resolveMaterialFromUrl } from "@/services/materials/fromUrl";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 從共享庫匯入一個商品：用「匯入者自己」的蝦皮金鑰重產分潤連結（分潤算自己），
// 並重用分享者的文案（省 token）。不外露分享者的分潤連結。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "string") return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });

    const shared = await getSharedMaterial(id);
    if (!shared || !shared.clean_product_url) {
      return NextResponse.json({ ok: false, error: "找不到共享商品" }, { status: 404 });
    }
    if (shared.owner_id === user.id) {
      return NextResponse.json({ ok: false, error: "這是你自己分享的商品，無需匯入" }, { status: 400 });
    }

    // 用匯入者自己的金鑰重產分潤連結（withCopy=false 不重燒 token；文案重用分享者的）。
    const { material, notes } = await resolveMaterialFromUrl(shared.clean_product_url, user, false);
    await setMaterialCopyIfEmpty(material.id, user.id, shared.main_text, shared.reply_text).catch(() => {});
    await incrementImportCount(id).catch(() => {});

    return NextResponse.json({ ok: true, materialId: material.id, notes });
  } catch (e) {
    log.error("匯入共享商品失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
