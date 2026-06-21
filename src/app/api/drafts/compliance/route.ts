import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiKey } from "@/lib/store";
import { isDemoMode } from "@/lib/env";
import { checkCompliance, MAX_COMPLIANCE_CHARS } from "@/services/ai/compliance";

export const dynamic = "force-dynamic";

// AI 內容合規預檢（on-demand）：用使用者自己的 Gemini 金鑰，檢查文案被降觸及/封號風險。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "沒有可檢查的文案" }, { status: 400 });
  if (text.length > MAX_COMPLIANCE_CHARS) {
    return NextResponse.json({ ok: false, error: `文案過長（上限 ${MAX_COMPLIANCE_CHARS} 字）` }, { status: 400 });
  }

  // 只用使用者自己綁的金鑰，不借用系統共用金鑰
  const key = isDemoMode ? "" : await getGeminiKey(user.id).catch(() => null);
  if (!key) {
    return NextResponse.json({ ok: false, error: "請先到帳號管理綁定你自己的 Gemini 金鑰" }, { status: 400 });
  }

  try {
    const result = await checkCompliance(text, key);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    log.error("AI 合規檢查失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "AI 檢查暫時無法完成，請稍後再試" }, { status: 500 });
  }
}
