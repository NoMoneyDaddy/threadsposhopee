import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { toggleMaterialFavorite, getFeatureFlags } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 切換收藏共享素材（高黏著度）。回傳切換後是否為已收藏。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const flags = await getFeatureFlags();
    if (!flags.favorites) return NextResponse.json({ ok: false, error: "收藏功能目前未開放" }, { status: 403 });
    const body = await req.json().catch(() => null);
    const id = (body as { id?: unknown })?.id;
    if (typeof id !== "string") return NextResponse.json({ ok: false, error: "缺少 id" }, { status: 400 });
    const favorited = await toggleMaterialFavorite(user.id, id);
    return NextResponse.json({ ok: true, favorited });
  } catch (e) {
    log.error("切換收藏失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
