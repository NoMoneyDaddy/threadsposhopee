import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { resolveUserIdByEmail, setRoles } from "@/lib/store";
import { sanitizeRoles } from "@/lib/roles";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 管理員賦予／調整某使用者的身份組（依 email 找人）。僅管理員（owner）可用。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    const body = await req.json().catch(() => null);
    const email = (body as { email?: unknown })?.email;
    const roles = sanitizeRoles((body as { roles?: unknown })?.roles);
    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "請填寫有效 email" }, { status: 400 });
    }
    const targetId = await resolveUserIdByEmail(email);
    if (!targetId) return NextResponse.json({ ok: false, error: "找不到該 email 的使用者" }, { status: 404 });
    await setRoles(targetId, roles);
    return NextResponse.json({ ok: true, roles });
  } catch (e) {
    log.error("設定身份組失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
