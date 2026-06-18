import { NextResponse } from "next/server";
import { getSessionClient } from "@/lib/supabase/clients";

// OAuth（Google）登入回呼：用授權碼換 session 並寫入 cookie，再導回站內。
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  // 防 open redirect：只允許站內相對路徑
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const sb = getSessionClient();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
