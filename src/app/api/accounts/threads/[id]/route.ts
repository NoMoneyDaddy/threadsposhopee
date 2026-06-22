import { NextResponse } from "next/server";
import { deleteThreadsAccount, setThreadsAccountStatus, renameThreadsAccount } from "@/lib/store";
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

// 更新帳號：啟用／暫停（暫停後發文佇列會跳過），或重新命名自訂暱稱（label）。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // 重新命名暱稱
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ ok: false, error: "暱稱不可空白" }, { status: 400 });
    if (label.length > 60) return NextResponse.json({ ok: false, error: "暱稱過長（上限 60 字）" }, { status: 400 });
    const ok = await renameThreadsAccount(params.id, user.id, label);
    if (!ok) return NextResponse.json({ ok: false, error: "找不到帳號或無權限" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  // 啟用／暫停
  if (body.status !== "active" && body.status !== "paused") {
    return NextResponse.json({ ok: false, error: "status 必須是 active 或 paused，或提供 label 重新命名" }, { status: 400 });
  }
  const ok = await setThreadsAccountStatus(params.id, user.id, body.status);
  if (!ok) return NextResponse.json({ ok: false, error: "找不到帳號或無權限" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
