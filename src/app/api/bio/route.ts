import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setBioSettings, normalizeBioHandle } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 設定 link-in-bio 的公開代稱（handle）與標題。handle 留空＝關閉 bio 頁。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const rawHandle = typeof (body as { handle?: unknown })?.handle === "string" ? (body as { handle: string }).handle.trim() : "";
    const rawTitle = typeof (body as { title?: unknown })?.title === "string" ? (body as { title: string }).title.trim().slice(0, 60) : "";

    let handle: string | null = null;
    if (rawHandle) {
      handle = normalizeBioHandle(rawHandle);
      if (!handle) {
        return NextResponse.json({ ok: false, error: "代稱僅能用 3–30 個英數、底線或連字號" }, { status: 400 });
      }
    }
    await setBioSettings(user.id, handle, rawTitle || null);
    return NextResponse.json({ ok: true, handle });
  } catch (e) {
    log.error("儲存 bio 設定失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
