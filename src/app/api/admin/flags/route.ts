import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setFeatureFlags } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 熱設定站台旗標（存 DB，不隨重新部署消失）。僅管理員（owner）可用。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const body = await req.json().catch(() => null);
    const patch: Record<string, boolean> = {};
    for (const k of ["shared", "leaderboard", "favorites"] as const) {
      const v = (body as Record<string, unknown> | null)?.[k];
      if (typeof v === "boolean") patch[k] = v;
    }
    const flags = await setFeatureFlags(patch);
    return NextResponse.json({ ok: true, flags });
  } catch (e) {
    log.error("更新站台設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
