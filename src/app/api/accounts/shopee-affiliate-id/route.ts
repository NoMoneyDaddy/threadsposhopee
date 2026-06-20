import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
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
    // 型別必須是 string 或 number；缺欄位/錯型別（如 {}、null）一律 400，
    // 不可悄悄當成空字串而把既有 affiliate_id 清掉。要清除請明確傳 affiliate_id: ""。
    if (typeof raw !== "string" && typeof raw !== "number") {
      return NextResponse.json({ ok: false, error: "缺少或型別錯誤的 affiliate_id" }, { status: 400 });
    }
    // 容錯：複製常夾空白（如 "1630 8730 014"）→ 去掉所有空白
    const affiliateId = String(raw).replace(/\s+/g, "");
    // 純數字才放行（空字串＝明確清除）；非數字擋下，避免組出壞連結
    if (affiliateId && !/^\d{3,20}$/.test(affiliateId)) {
      return NextResponse.json({ ok: false, error: "affiliate_id 應為純數字" }, { status: 400 });
    }
    await setShopeeAffiliateId(user.id, affiliateId || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("儲存 affiliate_id 失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
