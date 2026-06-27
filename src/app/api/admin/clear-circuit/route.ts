import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/auth";
import { clearAccountCircuit } from "@/lib/store";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// owner-only：手動解除某 Threads 帳號的斷路器冷卻（讓它下一輪 cron 恢復嘗試發文）。
// 以真實登入身分驗證（非 view-as），避免被冒用。
export async function POST(req: Request) {
  try {
    const real = await getRealUser();
    if (!real?.isPlatformOwner) return NextResponse.json({ ok: false, error: "僅限管理者" }, { status: 403 });
    const body = (await req.json().catch(() => ({}))) || {};
    const id = typeof body.account_id === "string" ? body.account_id.trim() : "";
    if (!id) return NextResponse.json({ ok: false, error: "缺少 account_id" }, { status: 400 });
    await clearAccountCircuit(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError("解除斷路器失敗", e);
  }
}
