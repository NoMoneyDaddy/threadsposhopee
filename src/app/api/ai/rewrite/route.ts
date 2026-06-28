import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiKey, resolveGeminiModel } from "@/lib/store";
import { generateVariations } from "@/services/ai/provider";
import { isDemoMode } from "@/lib/env";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 「換個說法」：把使用者目前的正文改寫成數個版本，回傳供前端挑選。只用使用者自綁的 Gemini 金鑰。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    // 信任邊界：先驗 body 為 JSON 物件（畸形 JSON／null 一律 400，不落到 500）。
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "request body 必須是 JSON 物件" }, { status: 400 });
    }
    const rawText = (body as { text?: unknown }).text;
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) return NextResponse.json({ ok: false, error: "請先輸入正文再換句話說" }, { status: 400 });
    if ([...text].length > 1000) return NextResponse.json({ ok: false, error: "正文過長，請先精簡再換句話說" }, { status: 400 });

    const key = await getGeminiKey(user.id);
    if (!isDemoMode && !key) {
      return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Gemini 金鑰" }, { status: 400 });
    }

    const model = await resolveGeminiModel(user.id);
    const variations = await generateVariations(text, key, 3, model);
    // 少於 2 個版本就不算「可挑選」，回 502 讓使用者重試（避免只給單一版本）。
    if (variations.length < 2) {
      return NextResponse.json({ ok: false, error: "AI 沒有產生足夠版本，請再試一次" }, { status: 502 });
    }
    return NextResponse.json({ ok: true, variations });
  } catch (e) {
    // 收斂對外錯誤：詳細記 server 端，回固定訊息（避免外洩上游/供應商回應）。
    return apiError("AI 換句話說失敗", e, { clientMessage: "改寫失敗，請稍後再試" });
  }
}
