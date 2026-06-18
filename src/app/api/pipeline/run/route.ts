import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 手動觸發爬取（owner 專屬）
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "只有管理者可執行爬取" }, { status: 403 });

    const results = await runAllSources();
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
