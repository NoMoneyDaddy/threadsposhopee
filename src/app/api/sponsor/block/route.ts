import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { setSponsorBlocked } from "@/lib/sponsor";

export const dynamic = "force-dynamic";

// 管理員把某帳號永久排除贊助（濫用/高風險）。owner 限定。body { accountId, blocked }。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅管理員可操作" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) || {};
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return NextResponse.json({ ok: false, error: "缺少 accountId" }, { status: 400 });
    await setSponsorBlocked(accountId, body.blocked !== false);
    return NextResponse.json({ ok: true, blocked: body.blocked !== false });
  } catch (e) {
    log.error("設定贊助黑名單失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
