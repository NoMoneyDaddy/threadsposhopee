import { NextResponse } from "next/server";
import { deleteThreadsAccount, setThreadsAccountStatus } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 刪除 Threads 發文帳號（僅本人）
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const ok = await deleteThreadsAccount(params.id, user.id);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到帳號或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// 啟用／暫停帳號（暫停後發文佇列會跳過）
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.status !== "active" && body.status !== "paused") {
    return NextResponse.json({ ok: false, error: "status 必須是 active 或 paused" }, { status: 400 });
  }
  const ok = await setThreadsAccountStatus(params.id, user.id, body.status);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到帳號或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
