import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { shortHostOf, isAllowedOnShortHost } from "@/lib/short-host";

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
  "/api/telegram/webhook", // Telegram 遠端審核 webhook（無 session，靠 secret token 標頭驗證）
  "/privacy",
  "/terms",
  "/data-deletion",
  "/sponsored",
  "/r/", // go2read 中轉頁（訪客點短連結，無登入）
  "/api/redirect/hit" // 中轉頁「繼續」計數 beacon（公開）
];

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // 短網域（go2read.link）只當轉址服務：只放行 /r/* 與計數 beacon，其餘一律 404，
  // 不外露主站任何頁面（主站 host 不受影響）。靠 NEXT_PUBLIC_SHORT_DOMAIN 認出短網域。
  const shortHost = shortHostOf(process.env.NEXT_PUBLIC_SHORT_DOMAIN);
  if (shortHost && (req.headers.get("host") ?? url.host) === shortHost) {
    if (isAllowedOnShortHost(url.pathname)) return NextResponse.next();
    return new NextResponse("Not found", { status: 404 });
  }

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
      // 反向代理後 url.host 可能是內部位址（如 localhost:8080），改用瀏覽器實際送的對外
      // Host（與短網域判斷一致），否則正常同源操作會被誤判為跨來源而擋掉。
      const reqHost =
        req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host") || url.host;
      let sameOrigin = false;
      try {
        sameOrigin = new URL(origin).host === reqHost; // 解析失敗（如 "null"/畸形）視為跨來源
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

  // 唯讀防護：管理者「以成員視角檢視」期間（帶 view_as cookie）擋下狀態變更請求，確保只看不動到成員資料。
  // 須在解析使用者之後判斷：僅平台管理者才套用；一般成員若殘留 cookie（如共用電腦換人登入）則自動清除，
  // 避免被鎖死（他們看不到結束檢視的工具列）。例外：view-as 切換/解除本身（已在 PUBLIC_PREFIXES 的 /auth 之外）。
  const viewAs = req.cookies.get("view_as")?.value;
  if (viewAs) {
    const isOwner = Boolean(user.email && user.email.toLowerCase() === (process.env.OWNER_EMAIL ?? "").toLowerCase());
    if (isOwner) {
      if (req.method !== "GET" && req.method !== "HEAD" && !url.pathname.startsWith("/api/admin/view-as")) {
        return NextResponse.json({ ok: false, error: "成員視角為唯讀，請先結束檢視再操作" }, { status: 403 });
      }
    } else {
      // 非管理者不該有此 cookie：清除以免誤擋其寫入操作。
      res.cookies.set("view_as", "", { path: "/", maxAge: 0 });
    }
  }

  return res;
}

export const config = {
  // 跳過靜態資源與圖片
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
