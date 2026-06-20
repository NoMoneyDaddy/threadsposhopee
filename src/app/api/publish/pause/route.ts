import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setPublishPaused, isPublishPaused } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 全域發文暫停開關（owner 限定）：緊急急停所有自動發文（cron + 立即跑一輪），免改 env/cron。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅 owner 可操作" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.paused !== "boolean") {
    return NextResponse.json({ ok: false, error: "參數錯誤，paused 必須為布林值" }, { status: 400 });
  }
  const paused = body.paused;
  try {
    await setPublishPaused(paused);
    return NextResponse.json({ ok: true, paused });
  } catch (e) {
    log.error("設定發文暫停失敗", { err: e });
    return NextResponse.json({ ok: false, error: "設定失敗，請稍後再試" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅 owner 可操作" }, { status: 403 });
  return NextResponse.json({ ok: true, paused: await isPublishPaused() });
}
