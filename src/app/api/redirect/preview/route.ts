import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchLinkPreview } from "@/services/og/preview";
import { assertSafePublicUrl } from "@/lib/url-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// 抓來源網址的 OG 預覽（標題/圖/描述），供建立短連結時前端預先帶入標題。
// 登入限定（避免被當免費 SSRF 探針）；URL 先過 SSRF 守衛。best-effort，失敗回空欄位。
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!raw) return NextResponse.json({ ok: false, error: "缺少 url" }, { status: 400 });
  try {
    assertSafePublicUrl(raw);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "網址不安全或格式錯誤" }, { status: 400 });
  }

  const preview = await fetchLinkPreview(raw);
  return NextResponse.json({ ok: true, ...preview });
}
