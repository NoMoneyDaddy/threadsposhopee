import { NextResponse } from "next/server";
import { setShopeeAffiliateId } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 綁定 Shopee affiliate_id（無 Open API 時用 an_redir 自組追蹤連結）。各人各設各的。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "請求格式錯誤（非合法 JSON）" }, { status: 400 });
    }
    const raw = (body as { affiliate_id?: unknown })?.affiliate_id;
    const affiliateId = typeof raw === "string" ? raw.trim() : "";
    // affiliate_id 為純數字字串；非數字直接擋下，避免組出壞連結
    if (affiliateId && !/^\d{3,20}$/.test(affiliateId)) {
      return NextResponse.json({ ok: false, error: "affiliate_id 應為純數字" }, { status: 400 });
    }
    await setShopeeAffiliateId(user.id, affiliateId || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("儲存 affiliate_id 失敗", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
