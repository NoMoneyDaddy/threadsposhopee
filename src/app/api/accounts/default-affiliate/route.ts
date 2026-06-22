import { NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { setDefaultAffiliateUrl } from "@/lib/store";
import { resolveAffiliateUrl } from "@/services/shopee/affiliate-link";
import { assertSafePublicUrl } from "@/lib/url-guard";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 設定/清除「預設分潤連結」（AI 代理人走 go2read 中轉時的『繼續』分潤連結）。
// 存檔時自動轉成分潤連結（已是分潤連結則不重複轉），免得每篇重設。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => null);
    const raw = (body as { url?: unknown })?.url;
    const url = typeof raw === "string" ? raw.trim() : "";
    if (url.length > 2000) return NextResponse.json({ ok: false, error: "連結過長" }, { status: 400 });
    if (!url) {
      await setDefaultAffiliateUrl(user.id, null);
      return NextResponse.json({ ok: true, url: null });
    }
    // 提前驗證使用者輸入（不安全/格式錯誤 → 400，而非轉換/存檔時才 500）。
    try {
      assertSafePublicUrl(url);
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "無效或不安全的連結" }, { status: 400 });
    }
    // 先轉分潤（已是分潤連結則原樣）；轉換結果再存（內含 SSRF/協定驗證）。
    const resolved = await resolveAffiliateUrl(user.id, url);
    await setDefaultAffiliateUrl(user.id, resolved.url);
    return NextResponse.json({ ok: true, url: resolved.url, converted: resolved.converted, note: resolved.note });
  } catch (e) {
    log.error("儲存預設分潤連結失敗", { err: e });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "伺服器暫時無法處理" }, { status: 500 });
  }
}
