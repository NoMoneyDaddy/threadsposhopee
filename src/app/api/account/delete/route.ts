import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteOwnerAccount } from "@/lib/store";
import { getSessionClient } from "@/lib/supabase/clients";
import { isDemoMode } from "@/lib/env";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 永久刪除自己的帳號與所有自有資料（不可復原），完成後登出。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (isDemoMode) return NextResponse.json({ ok: false, error: "Demo 模式不支援刪除帳號" }, { status: 400 });
  try {
    await deleteOwnerAccount(user.id);
  } catch (e) {
    log.error("刪除帳號失敗", { ownerId: user.id, err: e });
    return NextResponse.json({ ok: false, error: "刪除帳號時發生問題，請稍後再試或聯絡我們" }, { status: 500 });
  }
  // 清除本機 session（帳號已不存在）。失敗不影響刪除結果。
  await getSessionClient().auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
