import { NextResponse } from "next/server";
import { setPublishPaused, isPublishPaused } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 全域發文暫停開關（owner 限定）：緊急急停所有自動發文（cron + 立即跑一輪），免改 env/cron。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅 owner 可操作" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const paused = body.paused === true;
  try {
    await setPublishPaused(paused);
    return NextResponse.json({ ok: true, paused });
  } catch (e) {
    console.error("設定發文暫停失敗：", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "設定失敗，請稍後再試" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, paused: await isPublishPaused() });
}
