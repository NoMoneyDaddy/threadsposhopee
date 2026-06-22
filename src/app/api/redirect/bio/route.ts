import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setRedirectInBio } from "@/lib/redirect-store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 開關某短連結是否顯示在自己的 bio 頁。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const code = (body as { code?: unknown })?.code;
    const on = (body as { on?: unknown })?.on;
    if (typeof code !== "string" || typeof on !== "boolean") {
      return NextResponse.json({ ok: false, error: "缺少 code 或 on" }, { status: 400 });
    }
    const found = await setRedirectInBio(code, user.id, on);
    if (!found) return NextResponse.json({ ok: false, error: "找不到短連結" }, { status: 404 });
    return NextResponse.json({ ok: true, inBio: on });
  } catch (e) {
    log.error("更新 bio 連結失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
