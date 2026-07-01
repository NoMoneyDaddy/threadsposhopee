import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setAllMaterialsEvergreen } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 批次開關「常青回收」：把素材庫所有已入庫素材一次設為 on/off（多租戶：以登入者 id 過濾）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const on = (body as { on?: unknown })?.on;
    if (typeof on !== "boolean") {
      return NextResponse.json({ ok: false, error: "缺少 on" }, { status: 400 });
    }
    const updated = await setAllMaterialsEvergreen(user.id, on);
    return NextResponse.json({ ok: true, updated, on });
  } catch (e) {
    log.error("批次更新常青設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
