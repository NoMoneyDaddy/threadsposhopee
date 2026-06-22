import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteOwnerAccount } from "@/lib/store";
import { getSessionClient } from "@/lib/supabase/clients";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 永久刪除自己的帳號與所有自有資料（不可復原），完成後登出。
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (isDemoMode) return NextResponse.json({ ok: false, error: "Demo 模式不支援刪除帳號" }, { status: 400 });
  // 伺服器端再次驗證確認字串：避免略過前端防呆、直接帶 session 打 API 誤刪。
  const body = (await req.json().catch(() => null)) as { confirmText?: string } | null;
  if (body?.confirmText !== "刪除") {
    return NextResponse.json({ ok: false, error: "請輸入「刪除」以確認" }, { status: 400 });
  }
  try {
    await deleteOwnerAccount(user.id);
  } catch (e) {
    log.error("刪除帳號失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "刪除帳號時發生問題，請稍後再試或聯絡我們" }, { status: 500 });
  }
  // 清除本機 session（帳號已不存在）。失敗不影響刪除結果，但仍記錄以便排查。
  await getSessionClient()
    .auth.signOut()
    .catch((e) => log.warn("刪除帳號後登出失敗（不影響刪除結果）", { ownerId: user.id, err: e }));
  return NextResponse.json({ ok: true });
}
