import { NextResponse } from "next/server";
import { getCopyPrefs, setCopyPrefs } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 讀目前 AI 文案偏好（給設定表單初始化用）
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    return NextResponse.json({ ok: true, prefs: await getCopyPrefs(user.id) });
  } catch (e) {
    console.error("讀取文案偏好失敗", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}

// 存 AI 文案偏好（各人各設各的）。store 內 normalizeCopyPrefs 會夾成合法值。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const prefs = await setCopyPrefs(user.id, body.prefs ?? body);
    return NextResponse.json({ ok: true, prefs });
  } catch (e) {
    console.error("儲存文案偏好失敗", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
