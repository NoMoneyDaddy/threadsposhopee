import { NextResponse } from "next/server";
import { deleteSource, setSourceEnabled } from "@/lib/store";
import { getCurrentUser, type AppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 監看來源是 owner 專屬功能。回傳判別式聯集，讓 error 檢查後 user 能正確收斂為 AppUser。
async function requireOwner(): Promise<{ user: AppUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  if (!user.isOwner) {
    return { user: null, error: NextResponse.json({ ok: false, error: "只有管理者可操作監看來源" }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireOwner();
  if (ownerRes.error) return ownerRes.error;
  const ok = await deleteSource(params.id, ownerRes.user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 啟用／停用來源（停用後爬蟲跳過）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireOwner();
  if (ownerRes.error) return ownerRes.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled 必須是 boolean" }, { status: 400 });
  }
  const ok = await setSourceEnabled(params.id, ownerRes.user.id, body.enabled);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
