import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/services/threads/oauth";
import { getCurrentUser } from "@/lib/auth";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 導使用者去 Threads 授權頁。需先登入（middleware 已擋）；callback 才知道綁到哪個 user。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (isDemoMode || !env.threadsAppId || !env.threadsRedirectUri) {
    return NextResponse.json(
      { ok: false, error: "尚未設定 Threads App（THREADS_APP_ID / THREADS_REDIRECT_URI）" },
      { status: 400 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = buildAuthorizeUrl(env.threadsAppId, env.threadsRedirectUri, state);
  const res = NextResponse.redirect(authorizeUrl);
  // state 存短效 cookie，callback 時比對防 CSRF
  res.cookies.set("threads_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/"
  });
  return res;
}
