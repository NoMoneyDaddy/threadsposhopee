import { NextResponse } from "next/server";
import { getRealUser, VIEW_AS_COOKIE } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// owner-only：設定/解除「以成員視角檢視」。以真實登入身分驗證，避免被冒用。
// POST { user_id }：切到該成員（唯讀，由 middleware 擋寫入）。DELETE：解除、回到自己。
export async function POST(req: Request) {
  try {
    const real = await getRealUser();
    if (!real?.isPlatformOwner) return NextResponse.json({ ok: false, error: "僅限管理者" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!id) return NextResponse.json({ ok: false, error: "缺少 user_id" }, { status: 400 });
    const res = NextResponse.json({ ok: true });
    // httpOnly：前端不需讀，純由 server 判定；lax 足夠（僅影響本站 GET 導覽）。
    res.cookies.set(VIEW_AS_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
    return res;
  } catch (e) {
    return apiError("切換成員視角失敗", e);
  }
}

export async function DELETE() {
  try {
    const real = await getRealUser();
    if (!real?.isPlatformOwner) return NextResponse.json({ ok: false, error: "僅限管理者" }, { status: 403 });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(VIEW_AS_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return apiError("解除成員視角失敗", e);
  }
}
