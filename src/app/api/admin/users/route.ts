import { NextResponse } from "next/server";
import { getRealUser, listAllUsers } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// owner-only：列出所有平台使用者，供「切換成員視角」下拉選單。
export async function GET() {
  try {
    const real = await getRealUser();
    if (!real?.isPlatformOwner) return NextResponse.json({ ok: false, error: "僅限管理者" }, { status: 403 });
    // 排除管理者自己：無法「以自己視角檢視」，下拉只列其他成員。
    const users = (await listAllUsers()).filter((u) => u.id !== real.id);
    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return apiError("列出使用者失敗", e);
  }
}
