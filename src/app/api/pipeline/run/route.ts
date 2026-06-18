import { NextResponse } from "next/server";
import { runAllSources } from "@/services/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 手動觸發：跑所有啟用中的來源
export async function POST() {
  try {
    const results = await runAllSources();
    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
