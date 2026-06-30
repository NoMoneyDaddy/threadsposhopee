import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { setPublishPrefs } from "@/lib/store";
import { normalizePublishPrefsInput } from "@/lib/publish-prefs";

export const dynamic = "force-dynamic";

// 每位使用者自訂發文節奏（時段／最小間隔／每日上限）。各人各設各的。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const n = normalizePublishPrefsInput(body);
    if (!n.ok) return NextResponse.json({ ok: false, error: n.error }, { status: 400 });
    await setPublishPrefs(user.id, { slots: n.slots, minGapMinutes: n.minGapMinutes, maxPerDay: n.maxPerDay, replyDelayMin: n.replyDelayMin, replyDelayJitter: n.replyDelayJitter });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存發文節奏失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
