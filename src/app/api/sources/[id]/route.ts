import { NextResponse } from "next/server";
import { deleteSource, setSourceEnabled } from "@/lib/store";
import { getCurrentUser, type AppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 任何登入者皆可操作「自己的」來源；多租戶隔離由 store 以 owner_id 過濾保證（只動得到自己的列）。
async function requireUser(): Promise<{ user: AppUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { user, error: null };
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireUser();
  if (ownerRes.error) return ownerRes.error;
  const ok = await deleteSource(params.id, ownerRes.user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 啟用／停用來源（停用後抓取跳過）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ownerRes = await requireUser();
  if (ownerRes.error) return ownerRes.error;
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled 必須是 boolean" }, { status: 400 });
  }
  const ok = await setSourceEnabled(params.id, ownerRes.user.id, body.enabled);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到來源或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
