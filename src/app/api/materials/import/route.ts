import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getSharedMaterial, incrementImportCount, findMaterial, getFeatureFlags, countSharedByOwner, getImportsUsed, incrementImportsUsed } from "@/lib/store";
import { resolveMaterialFromUrl } from "@/services/materials/fromUrl";
import { importAllowance } from "@/lib/import-allowance";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 從共享庫匯入一個商品：用「匯入者自己」的蝦皮金鑰重產分潤連結（分潤算自己），
// 並重用分享者的文案（省 token）。不外露分享者的分潤連結。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!(await getFeatureFlags()).shared) {
      return NextResponse.json({ ok: false, error: "共享庫目前未開放" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "string") return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });

    const shared = await getSharedMaterial(id);
    if (!shared || !shared.clean_product_url) {
      // 已下架或連結失效（健檢判定後暫時下架）皆會查不到 → 一併以此訊息回覆。
      return NextResponse.json({ ok: false, error: "找不到共享商品（可能已下架或連結失效）" }, { status: 404 });
    }
    if (shared.owner_id === user.id) {
      return NextResponse.json({ ok: false, error: "這是你自己分享的商品，無需匯入" }, { status: 400 });
    }

    // 防重複刷分：匯入者已擁有該商品則不再累加分享者貢獻（仍重產/更新自己的素材）。
    const alreadyHad = await findMaterial(shared.shop_id, shared.item_id, user.id).catch(() => null);

    // 匯入額度（give-to-get）：初始只能匯入基礎額度，多分享素材解鎖更多。owner 不限；已擁有的商品重匯不計額度。
    if (!user.isOwner && !alreadyHad) {
      const [sharedCount, used] = await Promise.all([
        countSharedByOwner(user.id).catch(() => 0),
        getImportsUsed(user.id).catch(() => 0)
      ]);
      const allowance = importAllowance(sharedCount);
      if (used >= allowance) {
        return NextResponse.json(
          { ok: false, error: `匯入額度已用完（${used}/${allowance}）。到素材庫把商品「分享到共享庫」可解鎖更多匯入額度。` },
          { status: 403 }
        );
      }
    }
    // 用匯入者自己的金鑰重產分潤連結，並用匯入者自己的 Gemini「重新生成」文案（有金鑰才生成、沒金鑰留空）。
    // 不逐字沿用分享者文案：避免不同使用者文案相同（被判洗版/降觸及）。
    const { material, notes } = await resolveMaterialFromUrl(shared.clean_product_url, user, true);
    if (!alreadyHad) {
      await incrementImportCount(id).catch(() => {}); // 累加分享者貢獻
      if (!user.isOwner) await incrementImportsUsed(user.id).catch(() => {}); // 扣匯入額度
    }

    return NextResponse.json({ ok: true, materialId: material.id, notes });
  } catch (e) {
    log.error("匯入共享商品失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
