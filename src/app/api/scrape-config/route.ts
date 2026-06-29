import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getScrapeConfig, saveScrapeConfig, hasApifyCredentials } from "@/lib/store";
import { normalizeScrapeKeywords, normalizePostsLimit } from "@/lib/scrape-config";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 自動抓文設定（一份可保存的設定，不綁發文帳號）。平台管理員專屬。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!user.isOwner && !isDemoMode) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const config = await getScrapeConfig(user.id);
  return NextResponse.json({ ok: true, config });
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!user.isOwner && !isDemoMode) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    // 抓取靠自綁 Apify 金鑰（費用算自己）；未綁先擋（demo 模式略過）。
    if (!isDemoMode) {
      const apify = await hasApifyCredentials(user.id);
      if (!apify.bound) {
        return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Apify 金鑰" }, { status: 403 });
      }
    }
    const body = await req.json().catch(() => ({}));
    const keywords = normalizeScrapeKeywords(body?.keywords);
    const postsLimit = normalizePostsLimit(body?.postsLimit);
    const enabled = body?.enabled === false ? false : true;
    const config = await saveScrapeConfig(user.id, keywords, postsLimit, enabled);
    return NextResponse.json({ ok: true, config });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
