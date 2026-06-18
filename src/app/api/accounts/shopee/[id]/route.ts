import { NextResponse } from "next/server";
import { deleteShopeeAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 刪除 Shopee 分潤帳號（僅本人）
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const ok = await deleteShopeeAccount(params.id, user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到帳號或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
