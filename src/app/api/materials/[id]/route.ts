import { NextResponse } from "next/server";
import { deleteMaterial } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 刪除自己的素材（多租戶隔離由 store 以 owner_id 過濾保證，只刪得到自己的）。
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const ok = await deleteMaterial(params.id, user.id);
    if (!ok) return NextResponse.json({ ok: false, error: "找不到素材或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
