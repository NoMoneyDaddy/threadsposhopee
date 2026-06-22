import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAiAgent } from "@/lib/agents-store";
import { getGeminiKey } from "@/lib/credentials";
import { runAgentOnce } from "@/services/ai/agent-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 立即跑一次指定代理人，產出 1 篇草稿（待審）。body: { id }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const agent = id ? await getAiAgent(id, user.id) : null;
    if (!agent) return NextResponse.json({ ok: false, error: "找不到小編" }, { status: 404 });

    const key = await getGeminiKey(user.id);
    if (!key) return NextResponse.json({ ok: false, error: "請先在帳號管理綁定 Gemini 金鑰" }, { status: 400 });

    const r = await runAgentOnce(agent, key);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.reason ?? "未產生草稿" }, { status: 200 });
    return NextResponse.json({ ok: true, draftId: r.draftId });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
