import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

// Cron 端點共用驗證：生產環境必須設 CRON_SECRET，並用定時安全比較驗 Bearer。
// 回傳 NextResponse 代表「擋下」，回傳 null 代表「放行」。
export function assertCron(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "production" && !env.cronSecret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET 未設定（生產環境必填）" }, { status: 500 });
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
