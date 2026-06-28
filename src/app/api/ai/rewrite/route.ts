import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiKey } from "@/lib/store";
import { generateVariations } from "@/services/ai/provider";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 「換個說法」：把使用者目前的正文改寫成數個版本，回傳供前端挑選。只用使用者自綁的 Gemini 金鑰。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ ok: false, error: "請先輸入正文再換句話說" }, { status: 400 });
    if ([...text].length > 1000) return NextResponse.json({ ok: false, error: "正文過長，請先精簡再換句話說" }, { status: 400 });

    const key = await getGeminiKey(user.id);
    if (!isDemoMode && !key) {
      return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Gemini 金鑰" }, { status: 400 });
    }

    const variations = await generateVariations(text, key, 3);
    if (variations.length === 0) {
      return NextResponse.json({ ok: false, error: "AI 沒有產生可用版本，請再試一次" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, variations });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
