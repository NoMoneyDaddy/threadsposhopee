import { NextResponse } from "next/server";
import { deleteSource, setSourceEnabled } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 監看來源是 owner 專屬功能
async function requireOwner() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  if (!user.isOwner) return { error: NextResponse.json({ ok: false, error: "只有管理者可操作監看來源" }, { status: 403 }) };
  return { user };
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireOwner();
  if (error) return error;
  const ok = await deleteSource(params.id, user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 啟用／停用來源（停用後爬蟲跳過）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, error } = await requireOwner();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled 必須是 boolean" }, { status: 400 });
  }
  const ok = await setSourceEnabled(params.id, user.id, body.enabled);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
