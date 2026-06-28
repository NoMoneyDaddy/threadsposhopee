import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setUserGeminiModel } from "@/lib/store";
import { isAllowedGeminiModel } from "@/lib/ai-models";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// 設定/清除使用者自選的 AI 文案 Gemini 模型。空字串/null＝回到全站預設。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  // 信任邊界：合法 literal null/非物件不可直接讀 .model（會 TypeError → 500），先驗為物件。
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "request body 必須是 JSON 物件" }, { status: 400 });
  }
  const raw = (body as { model?: unknown }).model;
  const model = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  // 白名單把關：擋任意字串被存進來、之後打進 Gemini API。
  if (model !== null && !isAllowedGeminiModel(model)) {
    return NextResponse.json({ ok: false, error: "不支援的模型" }, { status: 400 });
  }
  try {
    await setUserGeminiModel(user.id, model);
  } catch (e) {
    // 收斂對外錯誤（避免外洩資料層細節），詳細只進 log。
    return apiError("儲存 Gemini 模型失敗", e, { clientMessage: "儲存失敗，請稍後再試" });
  }
  return NextResponse.json({ ok: true, model });
}
