import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { createFeedback, isFeedbackKind } from "@/lib/store";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// 送出一筆意見回饋／工單（bug 或功能建議）。登入即可，掛在自己名下。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    // demo 模式沿用與列表頁相同的 fallback owner id，讓未登入也能試送（頁面在 demo 仍顯示表單）。
    if (!user && !isDemoMode) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
    const ownerId = user?.id ?? "demo-user";

    const body = await req.json().catch(() => null);
    const kind = body?.kind;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    // 輸入驗證（信任邊界）：kind 須在白名單，標題/內容非空且限長，避免空白或超長灌爆。
    if (!isFeedbackKind(kind)) return NextResponse.json({ ok: false, error: "類型不正確" }, { status: 400 });
    if (!title || title.length > 120) return NextResponse.json({ ok: false, error: "標題必填且不超過 120 字" }, { status: 400 });
    if (!message || message.length > 4000) return NextResponse.json({ ok: false, error: "內容必填且不超過 4000 字" }, { status: 400 });

    const fb = await createFeedback({ kind, title, message }, ownerId);
    return NextResponse.json({ ok: true, feedback: fb });
  } catch (e) {
    return apiError("送出意見回饋失敗", e);
  }
}
