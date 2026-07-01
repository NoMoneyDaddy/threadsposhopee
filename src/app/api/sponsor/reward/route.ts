import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setSponsorRewardMode, getContributionScore } from "@/lib/store";
import { canOwnLink } from "@/lib/contribution";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 高貢獻者選擇贊助文回饋方式：exempt（免發）｜own_link（換成自己的分潤連結）。
// 僅達門檻者可設定（未達門檻照常每日平台贊助文）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const mode = (body as { mode?: unknown })?.mode;
    if (mode !== "exempt" && mode !== "own_link") {
      return NextResponse.json({ ok: false, error: "mode 必須為 exempt 或 own_link" }, { status: 400 });
    }
    const score = await getContributionScore(user.id).catch(() => 0);
    if (!canOwnLink(score)) {
      return NextResponse.json({ ok: false, error: "貢獻分數未達頂級門檻，尚不能設定回饋方式" }, { status: 403 });
    }
    await setSponsorRewardMode(user.id, mode);
    return NextResponse.json({ ok: true, mode });
  } catch (e) {
    log.error("更新贊助回饋方式失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
