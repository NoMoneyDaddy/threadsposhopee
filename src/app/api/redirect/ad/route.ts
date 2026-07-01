import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { getCurrentUser } from "@/lib/auth";
import { setRedirectAdUrl } from "@/lib/store";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 設定/清除「廣告跳轉頁」：body { url }（空＝清除）。訪客點自己短連結的中轉頁「繼續」時於新分頁開此頁。
// 安全：setRedirectAdUrl 內以 assertSafePublicUrl 擋內網/非法協定，不安全一律 400（不存）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const rl = await rateLimit("redirect_ad", user.id, 20, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = (await req.json().catch(() => ({}))) || {};
    const url = typeof body.url === "string" ? body.url.trim() : "";
    try {
      await setRedirectAdUrl(user.id, url || null);
    } catch {
      // assertSafePublicUrl 丟出＝網址不安全/格式不符 → 400（不洩漏內部細節）。
      return NextResponse.json({ ok: false, error: "廣告頁網址無效或不安全（需為公開的 http(s) 網址）" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, url: url || null });
  } catch (e) {
    log.error("設定廣告跳轉頁失敗", { err: e });
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
