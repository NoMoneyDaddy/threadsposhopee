import { NextResponse } from "next/server";
import { checkAffiliateLinks } from "@/services/materials/linkcheck";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// owner 手動觸發：只檢查自己的素材（scope 到本人），失效連結即時嘗試自動重產。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const r = await checkAffiliateLinks(user.id, user.id);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("手動連結健檢失敗：", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "連結健檢失敗，請稍後再試" }, { status: 500 });
  }
}
