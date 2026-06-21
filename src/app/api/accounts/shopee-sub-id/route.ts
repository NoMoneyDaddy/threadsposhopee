import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setShopeeSubId } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";
import { normalizeSubId } from "@/services/shopee/subid";

export const dynamic = "force-dynamic";

// 自訂分潤 subId（套用 API 短連結與 an_redir 長連結）。各人各設各的；依官方規範正規化。
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
    const raw = (body as { sub_id?: unknown })?.sub_id;
    // 缺欄位/錯型別一律 400，不可悄悄清空。要清除請明確傳 sub_id: ""。
    if (typeof raw !== "string") {
      return NextResponse.json({ ok: false, error: "缺少或型別錯誤的 sub_id" }, { status: 400 });
    }
    const cleaned = normalizeSubId(raw);
    // 有輸入但清洗後全空（全是非法字元）→ 擋下提示，而非靜默存空。
    if (raw.trim() && !cleaned) {
      return NextResponse.json({ ok: false, error: "subId 僅能含英數與底線" }, { status: 400 });
    }
    await setShopeeSubId(user.id, cleaned || null);
    return NextResponse.json({ ok: true, subId: cleaned || null });
  } catch (e) {
    log.error("儲存 shopee_sub_id 失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
