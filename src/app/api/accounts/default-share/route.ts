import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setDefaultShareMaterials } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 新素材是否預設分享到共享庫（各人各設，預設開）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "缺少或型別錯誤的 enabled" }, { status: 400 });
    }
    await setDefaultShareMaterials(user.id, body.enabled);
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    log.error("儲存 default_share_materials 失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
