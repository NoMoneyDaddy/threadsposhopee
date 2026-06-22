import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env, isDemoMode } from "./env";

// Cron 端點共用驗證：只要連接「真實資料」（非 demo）就必須設 CRON_SECRET，不分 NODE_ENV，
// 避免 staging/preview 連真 DB 卻無鑑權而被任意觸發真實發文。用定時安全比較驗 Bearer。
// 回傳 NextResponse 代表「擋下」，回傳 null 代表「放行」。
export function assertCron(req: Request): NextResponse | null {
  if (!isDemoMode && !env.cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 未設定（連接真實資料時必填）" }, { status: 500 });
  }
  if (env.cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${env.cronSecret}`;
    const a = Buffer.from(auth);
    const b = Buffer.from(expected);
    // timingSafeEqual 要求等長；長度不符直接視為失敗（長度本身非機密）
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  return null;
}
