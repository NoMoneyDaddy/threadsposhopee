import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { getDisplayName, setDisplayName } from "@/lib/store";

export const dynamic = "force-dynamic";

// 設定／清除會員平台暱稱（display_name）。空字串或 null＝清除。值會在 store 層正規化（去控制字元、上限 24 字）。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : null;
  try {
    const saved = await setDisplayName(user.id, name);
    return NextResponse.json({ ok: true, displayName: saved });
  } catch (e) {
    log.error("儲存會員暱稱失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "儲存失敗，請稍後再試" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const displayName = await getDisplayName(user.id).catch(() => null);
  return NextResponse.json({ ok: true, displayName });
}
