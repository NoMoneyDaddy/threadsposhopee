import { NextResponse } from "next/server";
import { bumpRedirectContinue } from "@/lib/redirect-store";

export const dynamic = "force-dynamic";

// 公開：中轉頁「繼續」beacon，累加 continues。無 body/失敗皆靜默回 200（純統計，不擋導流）。
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    if (code) await bumpRedirectContinue(code).catch(() => {});
  } catch {
    // 忽略
  }
  return NextResponse.json({ ok: true });
}
