import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { userOwnsThreadsAccount } from "@/lib/store";
import { setSponsorOptOut } from "@/lib/sponsor";

export const dynamic = "force-dynamic";

const MAX_DAYS = 60; // 臨時禁用最長 60 天，避免長期規避贊助

// 帳號臨時禁用贊助文：body { accountId, days }（days<=0 或省略＝立即恢復）。多租戶：驗證帳號歸屬。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) || {};
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    if (!accountId) return NextResponse.json({ ok: false, error: "缺少 accountId" }, { status: 400 });
    if (!(await userOwnsThreadsAccount(accountId, user.id))) {
      return NextResponse.json({ ok: false, error: "帳號不存在或不屬於你" }, { status: 403 });
    }
    const days = Number(body.days);
    if (!Number.isFinite(days) || days <= 0) {
      await setSponsorOptOut(accountId, null); // 恢復
      return NextResponse.json({ ok: true, until: null });
    }
    const capped = Math.min(Math.floor(days), MAX_DAYS);
    const until = new Date(Date.now() + capped * 86400_000).toISOString();
    await setSponsorOptOut(accountId, until);
    return NextResponse.json({ ok: true, until });
  } catch (e) {
    log.error("設定贊助文臨時禁用失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
