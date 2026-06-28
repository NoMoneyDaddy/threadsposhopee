import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { replyFeedbackAsAdmin, isFeedbackStatus } from "@/lib/feedback-store";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// 管理員（平台 owner）前端回覆工單／更新狀態。僅 owner 可用。
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅管理員可回覆" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const patch: { admin_reply?: string | null; status?: "open" | "in_progress" | "resolved" | "closed" } = {};
    if (typeof body?.admin_reply === "string") {
      const reply = body.admin_reply.trim();
      if (reply.length > 4000) return NextResponse.json({ ok: false, error: "回覆不超過 4000 字" }, { status: 400 });
      patch.admin_reply = reply || null;
    }
    if (body?.status !== undefined) {
      if (!isFeedbackStatus(body.status)) return NextResponse.json({ ok: false, error: "狀態不正確" }, { status: 400 });
      patch.status = body.status;
    }
    if (patch.admin_reply === undefined && patch.status === undefined) {
      return NextResponse.json({ ok: false, error: "沒有要更新的內容" }, { status: 400 });
    }

    const fb = await replyFeedbackAsAdmin(params.id, patch);
    if (!fb) return NextResponse.json({ ok: false, error: "找不到該工單" }, { status: 404 });
    return NextResponse.json({ ok: true, feedback: fb });
  } catch (e) {
    return apiError("回覆意見回饋失敗", e);
  }
}
