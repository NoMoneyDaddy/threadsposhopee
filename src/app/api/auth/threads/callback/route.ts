import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectThreadsAccount } from "@/services/threads/oauth";
import { upsertThreadsAccountFromOAuth, canAddThreadsAccount } from "@/lib/store";
import { PLAN_LABELS, type PlanId } from "@/lib/plans";
import { getCurrentUser } from "@/lib/auth";
import { env, isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Threads 授權回呼：用 code 換長期 token，upsert 成發文帳號，導回帳號管理。
export async function GET(req: Request) {
  const url = new URL(req.url);
  // 相對路徑轉址：避免反向代理後 url.origin 變內部位址（localhost:8080）而導去錯誤網域。
  const redirectTo = (path: string) => new NextResponse(null, { status: 302, headers: { Location: path } });
  const back = (note: string, ok = false) =>
    redirectTo(`/accounts?threads=${ok ? "ok" : "err"}&note=${encodeURIComponent(note)}`);

  const user = await getCurrentUser();
  if (!user) return redirectTo("/login");
  if (isDemoMode || !env.threadsAppId || !env.threadsAppSecret || !env.threadsRedirectUri) {
    return back("尚未設定 Threads App");
  }

  const error = url.searchParams.get("error");
  if (error) return back(url.searchParams.get("error_description") || error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = cookies().get("threads_oauth_state")?.value;
  if (!code) return back("缺少授權碼");
  if (!state || !savedState || state !== savedState)
    return back("授權驗證失敗（常見於手機在 Threads App／不同瀏覽器完成授權）。請在同一個瀏覽器、建議用電腦完成，或改用手動填入 access token。");

  try {
    const acc = await connectThreadsAccount({
      clientId: env.threadsAppId,
      clientSecret: env.threadsAppSecret,
      redirectUri: env.threadsRedirectUri,
      code
    });
    // 方案配額：超過上限擋下（owner 不受限；重新授權既有帳號不占名額）
    const quota = await canAddThreadsAccount(user.id, { isOwner: user.isOwner, threadsUserId: acc.userId });
    if (!quota.ok) {
      return back(`已達${PLAN_LABELS[quota.plan as PlanId]}上限（${quota.limit} 個發文帳號），請升級方案後再連結。`);
    }
    await upsertThreadsAccountFromOAuth(
      {
        label: acc.username,
        threads_user_id: acc.userId,
        access_token: acc.accessToken,
        token_expires_at: acc.expiresAt
      },
      user.id
    );
    const res = back(`已連結 @${acc.username}`, true);
    res.cookies.set("threads_oauth_state", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    return back(e instanceof Error ? e.message : String(e));
  }
}
