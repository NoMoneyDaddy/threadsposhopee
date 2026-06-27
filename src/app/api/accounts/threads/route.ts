import { NextResponse } from "next/server";
import { upsertThreadsAccountFromOAuth, canAddThreadsAccount } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { exchangeForLongLivedToken, refreshLongLivedToken } from "@/services/threads/token";
import { getThreadsProfile } from "@/services/threads/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY_SEC = 24 * 60 * 60;
// 由 expires_in 算到期日；缺失/異常時預設 60 天（Threads 長期 token 預設效期）。
function expiryFrom(expiresInSec?: number): string {
  const s = typeof expiresInSec === "number" && !Number.isNaN(expiresInSec) && expiresInSec > 0 ? expiresInSec : 60 * DAY_SEC;
  return new Date(Date.now() + s * 1000).toISOString();
}

// 手動新增 Threads 發文帳號：只需「顯示名稱 + access token」。
// 系統自動：①（有填 App 密鑰時）把短期 token 換成 60 天長期 token；②用 token 取回帳號 id／暱稱／頭像；
// ③設定到期日後納入每日自動展期（refresh）。body: { label, access_token, client_secret? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const rawToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
    const clientSecret = typeof body.client_secret === "string" ? body.client_secret.trim() : "";
    if (!label) return NextResponse.json({ ok: false, error: "請填顯示名稱" }, { status: 400 });
    if (!rawToken) return NextResponse.json({ ok: false, error: "請貼上 access token" }, { status: 400 });

    // 自動長期化：有填 App 密鑰 → 短期換長期；否則嘗試 refresh（已是長期 token 時可取得新到期日）。
    // 兩者皆 best-effort 失敗不擋（可能本來就是長期 token）；最終到期日不明則預設 60 天，交由自動展期校正。
    let token = rawToken;
    let expiresAt: string | null = null;
    if (clientSecret) {
      try {
        const r = await exchangeForLongLivedToken(rawToken, clientSecret);
        if (r.accessToken) {
          token = r.accessToken;
          expiresAt = expiryFrom(r.expiresInSec);
        }
      } catch {
        /* 可能不是短期 token 或密鑰不符；往下用 refresh / 原 token */
      }
    }
    if (!expiresAt) {
      try {
        const r = await refreshLongLivedToken(token);
        if (r.accessToken) {
          token = r.accessToken;
          expiresAt = expiryFrom(r.expiresInSec);
        }
      } catch {
        /* 短期 token 無法 refresh：以原 token 存入，到期日預設 60 天 */
      }
    }

    // 用 token 取回帳號 id／暱稱／頭像（id 必須取得，否則無法綁定）。
    const profile = await getThreadsProfile(token).catch(() => null);
    if (!profile?.id) {
      return NextResponse.json({ ok: false, error: "無法用此 token 取得帳號資訊，請確認 access token 是否正確且仍有效" }, { status: 400 });
    }

    // 帳號配額：超過上限擋下（owner 取較高上限；既有同帳號更新不占名額）
    const quota = await canAddThreadsAccount(user.id, { isOwner: user.isOwner, threadsUserId: profile.id });
    if (!quota.ok) {
      return NextResponse.json(
        { ok: false, code: "account_limit", error: `已達發文帳號上限（${quota.limit} 個），無法再新增。` },
        { status: 403 }
      );
    }

    await upsertThreadsAccountFromOAuth(
      {
        label,
        threads_user_id: profile.id,
        // 顯示名稱回退到 label，避免 name/username 皆空時把既有顯示名稱覆寫成空字串。
        display_name: profile.name || profile.username || label,
        avatar_url: profile.avatarUrl,
        access_token: token,
        // 換/展長效成功才有確切到期日；都失敗＝到期日未知 → 存 null，讓展期 worker 立即接手
        // （短效 token 會儘快被嘗試展期、失敗則標記，不再假裝 60 天而延誤）。
        token_expires_at: expiresAt
      },
      user.id
    );
    // 安全：不把帳號物件（含任何金鑰相關欄位）回傳前端，前端只需知道成功。
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
