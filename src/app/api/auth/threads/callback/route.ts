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
  const back = (note: string, ok = false) =>
    NextResponse.redirect(new URL(`/accounts?threads=${ok ? "ok" : "err"}&note=${encodeURIComponent(note)}`, url.origin));

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  if (isDemoMode || !env.threadsAppId || !env.threadsAppSecret || !env.threadsRedirectUri) {
    return back("尚未設定 Threads App");
  }

  const error = url.searchParams.get("error");
  if (error) return back(url.searchParams.get("error_description") || error);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = cookies().get("threads_oauth_state")?.value;
  if (!code) return back("缺少授權碼");
  if (!state || !savedState || state !== savedState) return back("state 驗證失敗，請重試");

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
