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
  // 用相對路徑轉址：瀏覽器以網址列（對外網域）為基準解析，繞過反向代理把
  // req.url 變成內部位址（如 localhost:8080）導致登入後被導去 localhost 的問題。
  return new NextResponse(null, { status: 302, headers: { Location: safeNext } });
}
