import { NextResponse } from "next/server";
import { runSourcesForOwner } from "@/services/pipeline/run";
import { getCurrentUser } from "@/lib/auth";
import { hasApifyCredentials } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 手動觸發抓取：跑自己的來源、用自己的 Apify 金鑰
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const apify = await hasApifyCredentials(user.id).catch(() => ({ bound: false }));
    if (!apify.bound) {
      return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Apify 金鑰" }, { status: 403 });
    }

    const results = await runSourcesForOwner(user.id);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
