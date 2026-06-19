import { NextResponse } from "next/server";
import { setGeminiKey } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { validateGeminiKey } from "@/services/validate/keys";

export const dynamic = "force-dynamic";

// 綁定 Gemini API key（AI 子系統）。key 加密存放。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const key = typeof body.key === "string" ? body.key.trim() : "";
    if (!key) return NextResponse.json({ ok: false, error: "缺少 Gemini API key" }, { status: 400 });

    const check = await validateGeminiKey(key);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.reason }, { status: 400 });

    await setGeminiKey(user.id, key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("gemini credential bind failed", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
