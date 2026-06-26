import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateRedirectLink, deleteRedirectLink } from "@/lib/redirect-store";

export const dynamic = "force-dynamic";

// 編輯短連結目的地/分潤/標題（短碼不變）。多租戶隔離由 store 以 owner_id 過濾保證。
// body: { sourceUrl, affiliateUrl?, title? }
export async function PATCH(req: Request, { params }: { params: { code: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
    if (!sourceUrl) return NextResponse.json({ ok: false, error: "請填來源網址" }, { status: 400 });

    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const found = await updateRedirectLink(params.code, user.id, {
      sourceUrl,
      affiliateUrl: str(body.affiliateUrl),
      title: str(body.title)
    });
    if (!found) return NextResponse.json({ ok: false, error: "找不到短連結或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // updateRedirectLink 對非法/內網 URL 會丟錯（SSRF 守衛）→ 對外回 400
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

// 刪除短連結（多租戶：只刪得到自己的）。
export async function DELETE(_req: Request, { params }: { params: { code: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  const found = await deleteRedirectLink(params.code, user.id);
  if (!found) return NextResponse.json({ ok: false, error: "找不到短連結或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
