import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// 全站登入保護：未登入一律導去 /login。
// 例外：登入/OAuth、cron（CRON_SECRET 保護）、Meta 回呼（由 signed_request 驗證，無 session）、
// 公開法務／資料刪除頁（供平台審核與使用者無登入檢視）、靜態資源。
const PUBLIC_PREFIXES = [
  "/login",
  "/api/cron",
  "/auth",
  "/api/auth/threads/deauthorize",
  "/api/auth/threads/data-deletion",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/sponsored",
  "/r/", // go2read 中轉頁（訪客點短連結，無登入）
  "/api/redirect/hit" // 中轉頁「繼續」計數 beacon（公開）
];

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  // 未設定 Supabase（Demo 模式）→ 不啟用登入保護
  if (!supabaseUrl || !anonKey) return NextResponse.next();

  if (PUBLIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // CSRF 縱深防禦：狀態變更請求若帶 Origin，必須同源（瀏覽器跨站 POST 一定帶 Origin）。
  // 公開端點（cron／Meta 回呼）已在上方放行；server-to-server 無 Origin 不受影響。
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin) {
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).host === url.host; // 解析失敗（如 "null"/畸形）視為跨來源
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin) {
        return NextResponse.json({ ok: false, error: "跨來源請求被拒" }, { status: 403 });
      }
    }
  }

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", url.pathname + url.search);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  // 跳過靜態資源與圖片
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
