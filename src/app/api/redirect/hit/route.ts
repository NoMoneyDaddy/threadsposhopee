import { NextResponse } from "next/server";
import { bumpRedirectContinue } from "@/lib/redirect-store";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 公開：中轉頁「繼續」beacon，累加 continues。無 body/失敗皆靜默回 200（純統計，不擋導流）。
export async function POST(req: Request) {
  // 公開 beacon 防灌水：每 IP 每分鐘上限（超過回 429，不污染 continues 統計、不壓 DB）。
  const rl = await rateLimit("redirect_hit", clientIp(req), 120, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    if (code) await bumpRedirectContinue(code).catch(() => {});
  } catch {
    // 忽略
  }
  return NextResponse.json({ ok: true });
}
