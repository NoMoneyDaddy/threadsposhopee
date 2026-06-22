import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setMaterialReview, getRoles } from "@/lib/store";
import { isReviewer } from "@/lib/roles";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 審核共享素材：下架（removed）／恢復（approved）。僅審查員或管理員可用。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const roles = await getRoles(user.id);
    if (!isReviewer(roles, user.isOwner)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => null);
    const id = (body as { id?: unknown })?.id;
    const status = (body as { status?: unknown })?.status;
    if (typeof id !== "string" || (status !== "approved" && status !== "removed" && status !== "pending")) {
      return NextResponse.json({ ok: false, error: "缺少 id 或 status 不合法" }, { status: 400 });
    }
    await setMaterialReview(id, status);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    log.error("審核共享素材失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
