import { NextResponse } from "next/server";
import { getRealUser, listAllUsers } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// owner-only：列出所有平台使用者，供「切換成員視角」下拉選單。
export async function GET() {
  try {
    const real = await getRealUser();
    if (!real?.isPlatformOwner) return NextResponse.json({ ok: false, error: "僅限管理者" }, { status: 403 });
    const users = await listAllUsers();
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return apiError("列出使用者失敗", e);
  }
}
