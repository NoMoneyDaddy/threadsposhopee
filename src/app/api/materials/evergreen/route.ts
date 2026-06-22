import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setMaterialEvergreen } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 開關某素材的「常青回收」（多租戶：以登入者 id 過濾）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const id = (body as { material_id?: unknown })?.material_id;
    const on = (body as { on?: unknown })?.on;
    if (typeof id !== "string" || typeof on !== "boolean") {
      return NextResponse.json({ ok: false, error: "缺少 material_id 或 on" }, { status: 400 });
    }
    const found = await setMaterialEvergreen(id, user.id, on);
    if (!found) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });
    return NextResponse.json({ ok: true, evergreen: on });
  } catch (e) {
    log.error("更新常青設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
