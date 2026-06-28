import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setUserGeminiModel } from "@/lib/store";
import { isAllowedGeminiModel } from "@/lib/ai-models";

export const dynamic = "force-dynamic";

// 設定/清除使用者自選的 AI 文案 Gemini 模型。空字串/null＝回到全站預設。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const raw = (body as { model?: unknown }).model;
  const model = typeof raw === "string" && raw.trim() ? raw.trim() : null;
  // 白名單把關：擋任意字串被存進來、之後打進 Gemini API。
  if (model !== null && !isAllowedGeminiModel(model)) {
    return NextResponse.json({ ok: false, error: "不支援的模型" }, { status: 400 });
  }
  try {
    await setUserGeminiModel(user.id, model);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "儲存失敗" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, model });
}
