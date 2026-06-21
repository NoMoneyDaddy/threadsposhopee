import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateAiAgent, deleteAiAgent } from "@/lib/agents-store";

export const dynamic = "force-dynamic";

// 更新代理人（目前主要用於 enabled 開關，亦可改名/口吻等）。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.tone === "string") patch.tone = body.tone.slice(0, 300);
  if (typeof body.use_redirect === "boolean") patch.use_redirect = body.use_redirect;
  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "無可更新欄位" }, { status: 400 });
  try {
    await updateAiAgent(params.id, user.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  await deleteAiAgent(params.id, user.id);
  return NextResponse.json({ ok: true });
}
